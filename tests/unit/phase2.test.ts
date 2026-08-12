import { describe, expect, it, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { detectFrameworks } from '../../src/detect/frameworks/index.js'
import { affectedPackages, detectMonorepo, listWorkspacePackages } from '../../src/detect/monorepo.js'
import { formatHtml } from '../../src/reporters/html.js'
import { loadPolicy } from '../../src/policy/schema.js'
import { fetchAdvisoryFindings } from '../../src/checks/advisories.js'
import { parseArgs } from '../../src/cli/args.js'
import type { ReportModel } from '../../src/core/types.js'

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
