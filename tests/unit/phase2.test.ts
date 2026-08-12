import { describe, expect, it, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { detectFrameworks, suggestBuildFromAdapters } from '../../src/detect/frameworks/index.js'
import {
  affectedPackages,
  detectMonorepo,
  listWorkspacePackages,
  packageFilterCommand,
} from '../../src/detect/monorepo.js'
import {
  resolveWorkspaceScript,
  resolveWorkspaceTypecheck,
} from '../../src/detect/workspace-project.js'
import { formatHtml } from '../../src/reporters/html.js'
import { loadPolicy } from '../../src/policy/schema.js'
import { fetchAdvisoryFindings } from '../../src/checks/advisories.js'
import { dependencyFindingInputs, runDependencyCheck } from '../../src/checks/dependencies.js'
import { parseArgs } from '../../src/cli/args.js'
import { detectProject } from '../../src/detect/project.js'
import type { ProjectModel, ReportModel } from '../../src/core/types.js'

describe('extra framework adapters', () => {
  it('detects Fastify, Hono, Nuxt, Astro, SvelteKit, Angular, Vue, and Remix', () => {
    expect(detectFrameworks({ dependencies: { fastify: '5.0.0' } }, new Set())).toContain('fastify')
    expect(detectFrameworks({ dependencies: { hono: '4.0.0' } }, new Set())).toContain('hono')
    expect(detectFrameworks({ dependencies: { nuxt: '3.0.0' } }, new Set(['nuxt.config.ts']))).toContain('nuxt')
    expect(detectFrameworks({ dependencies: { astro: '5.0.0' } }, new Set(['astro.config.mjs']))).toContain('astro')
    expect(detectFrameworks({ dependencies: { '@sveltejs/kit': '2.0.0' } }, new Set())).toContain('sveltekit')
    expect(detectFrameworks({ dependencies: { '@angular/core': '19.0.0' } }, new Set(['angular.json']))).toContain('angular')
    expect(detectFrameworks({ dependencies: { vue: '3.0.0' } }, new Set())).toContain('vue')
    expect(detectFrameworks({ dependencies: { '@remix-run/node': '2.0.0' } }, new Set())).toContain('remix')
  })

  it('suggestBuild returns null when no build script exists', () => {
    expect(suggestBuildFromAdapters(['nextjs'], {})).toBeNull()
    expect(suggestBuildFromAdapters(['nextjs'], { build: 'next build' })).toEqual({
      command: 'build',
      tool: 'next',
    })
  })

  it('wires suggestBuild into detectProject', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-fw-'))
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'app',
        dependencies: { next: '15.0.0' },
        scripts: { build: 'next build' },
      }),
    )
    fs.writeFileSync(path.join(dir, 'next.config.js'), 'module.exports = {}')
    const project = detectProject(dir)
    expect(project.frameworks).toContain('nextjs')
    expect(project.build.tool).toBe('next')
    expect(project.build.command).toContain('build')
  })
})

describe('monorepo targeting', () => {
  it('lists workspace packages and affected packages from a diff', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-mono-'))
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['packages/*'] }),
    )
    fs.mkdirSync(path.join(dir, 'packages', 'api'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'packages', 'web'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'packages', 'api', 'package.json'), JSON.stringify({ name: 'api' }))
    fs.writeFileSync(path.join(dir, 'packages', 'web', 'package.json'), JSON.stringify({ name: 'web' }))

    const files = new Set(fs.readdirSync(dir))
    const shape = detectMonorepo(dir, files)
    expect(shape.kind).not.toBe('none')
    const packages = listWorkspacePackages(dir)
    expect(packages.map((p) => p.name).sort()).toEqual(['api', 'web'])
    const affected = affectedPackages(
      {
        baseRef: 'base',
        headRef: 'head',
        staged: false,
        files: [
          {
            path: 'packages/api/src/index.ts',
            status: 'M',
            language: 'typescript',
            riskDomains: ['other'],
            hunks: [],
            baseContent: '',
            currentContent: '',
          },
        ],
      },
      packages,
    )
    expect(affected.map((p) => p.name)).toEqual(['api'])
  })

  it('resolves per-package scripts via workspace filters', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-mono-cmd-'))
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['packages/*'] }),
    )
    fs.mkdirSync(path.join(dir, 'packages', 'api'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'packages', 'api', 'package.json'),
      JSON.stringify({
        name: 'api',
        scripts: { test: 'vitest', build: 'tsc', lint: 'eslint .', typecheck: 'tsc -p .' },
      }),
    )
    fs.writeFileSync(path.join(dir, 'packages', 'api', 'tsconfig.json'), '{}')

    const project: ProjectModel = {
      root: dir,
      runtime: 'node',
      language: 'typescript',
      packageManager: 'npm',
      frameworks: ['node'],
      build: { command: null, tool: null },
      test: { command: null, runner: null },
      lint: { command: null, tool: null },
      orm: 'none',
      monorepo: { kind: 'pnpm', packages: ['packages/api'] },
      ci: { provider: 'none' },
      envPrefixes: [],
      packageJsonScripts: {},
    }
    const pkg = listWorkspacePackages(dir)[0]!
    expect(resolveWorkspaceTypecheck(project, pkg)).toContain('-w')
    expect(resolveWorkspaceScript(project, pkg, 'test')).toBe(
      packageFilterCommand('npm', 'test', 'api'),
    )
    expect(resolveWorkspaceScript(project, pkg, 'build')).toContain('build')
    expect(resolveWorkspaceScript(project, pkg, 'lint')).toContain('lint')
  })

  it('reads dependency changes from workspace package.json', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-mono-deps-'))
    fs.mkdirSync(path.join(dir, 'packages', 'api'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['packages/*'], dependencies: {} }),
    )
    fs.writeFileSync(
      path.join(dir, 'packages', 'api', 'package.json'),
      JSON.stringify({
        name: 'api',
        dependencies: { lodash: '^4.17.21', 'left-pad': '1.0.0' },
      }),
    )

    const project = detectProject(dir)
    const diff = {
      baseRef: 'base',
      headRef: 'head',
      staged: false,
      files: [
        {
          path: 'packages/api/package.json',
          status: 'M' as const,
          language: 'json' as const,
          riskDomains: ['dependencies' as const],
          hunks: [],
          baseContent: JSON.stringify({
            name: 'api',
            dependencies: { lodash: '^4.17.20' },
          }),
          currentContent: '',
        },
      ],
    }

    const inputs = dependencyFindingInputs(project, diff)
    expect(inputs.added.some((a) => a.name === 'left-pad')).toBe(true)
    expect(inputs.majors).toHaveLength(0)

    const check = await runDependencyCheck(project, diff)
    expect(check.summary).toContain('added')
  })
})

describe('HTML reporter', () => {
  it('renders merge status and findings', () => {
    const html = formatHtml({
      project: {
        root: '/tmp',
        runtime: 'node',
        language: 'typescript',
        packageManager: 'npm',
        frameworks: ['express'],
        build: { command: null, tool: null },
        test: { command: null, runner: null },
        lint: { command: null, tool: null },
        orm: 'none',
        monorepo: { kind: 'none', packages: [] },
        ci: { provider: 'none' },
        envPrefixes: [],
        packageJsonScripts: {},
      },
      diff: { baseRef: 'main', headRef: 'HEAD', files: [], staged: false },
      checks: [{ id: 'typecheck', title: 'Typecheck', status: 'passed', summary: 'Passed' }],
      findings: [
        {
          id: '1',
          ruleId: 'sec.eval',
          title: 'eval',
          severity: 'high',
          confidence: 'confirmed',
          message: 'eval introduced',
          file: 'src/app.ts',
          line: 10,
          evidence: {},
          category: 'security',
        },
      ],
      changeRisk: 'HIGH',
      readiness: 80,
      mergeStatus: 'BLOCKED',
      blockedReasons: ['sec.eval'],
    } satisfies ReportModel)
    expect(html).toContain('AgentProof')
    expect(html).toContain('BLOCKED')
    expect(html).toContain('sec.eval')
    expect(html).toContain('src/app.ts:10')
  })
})

describe('TypeScript policy config', () => {
  it('loads agentproof.config.ts', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-cfg-'))
    fs.writeFileSync(
      path.join(dir, 'agentproof.config.ts'),
      'export default { fail_on: "critical", require: { typecheck: false } }\n',
    )
    const policy = await loadPolicy(dir)
    expect(policy.fail_on).toBe('critical')
    expect(policy.require.typecheck).toBe(false)
  })
})

describe('OSV advisories', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps querybatch results into findings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              vulns: [
                {
                  id: 'GHSA-test-0001',
                  summary: 'Prototype pollution',
                  database_specific: { severity: 'HIGH' },
                },
              ],
            },
          ],
        }),
      })),
    )
    const findings = await fetchAdvisoryFindings(
      [{ name: 'lodash', version: '^4.17.20' }],
      true,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]?.ruleId).toBe('dep.advisory')
    expect(findings[0]?.severity).toBe('high')
    expect(findings[0]?.message).toContain('GHSA-test-0001')
  })

  it('skips when disabled', async () => {
    const findings = await fetchAdvisoryFindings([{ name: 'lodash', version: '4.17.21' }], false)
    expect(findings).toHaveLength(0)
  })
})

describe('parseArgs', () => {
  it('parses html output path', () => {
    const opts = parseArgs(['--html', 'out/report.html', '--skip-checks'])
    expect(opts.html).toBe('out/report.html')
    expect(opts.skipChecks).toBe(true)
  })
})
