import { describe, expect, it } from 'vitest'
import { execa } from 'execa'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import { runPipeline } from '../../src/core/pipeline.js'
import { runRules } from '../../src/rules/registry.js'
import { defaultPolicy } from '../../src/policy/schema.js'
import type { DiffFile, ProjectModel } from '../../src/core/types.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('CLI help', () => {
  it('prints help', async () => {
    const result = await execa('node', ['--import', 'tsx', 'src/cli/index.ts', '--help'], {
      cwd: root,
      reject: false,
    }).catch(async () => {
      // prefer built binary when available
      await execa('npm', ['run', 'build'], { cwd: root })
      return execa('node', ['dist/cli/index.js', '--help'], { cwd: root })
    })
    // build then run
    await execa('npm', ['run', 'build'], { cwd: root })
    const help = await execa('node', ['dist/cli/index.js', '--help'], { cwd: root })
    expect(help.stdout.toLowerCase()).toContain('agentproof')
    expect(help.stdout).toContain('--html')
    void result
  })
})

describe('pipeline JSON', () => {
  it('runs against repo with skip-checks', async () => {
    const { report, output } = await runPipeline({
      cwd: root,
      staged: false,
      json: true,
      sarif: false,
      ci: false,
      skipChecks: true,
    })
    expect(report.project.runtime).toBe('node')
    expect(output).toContain('"tool": "agentproof"')
    expect(output).toContain('"version": "0.3.1"')
  })
})

describe('vulnerable fixture rules', () => {
  it('finds multiple issues in vulnerable sources via synthetic diff', async () => {
    const vuln = fs.readFileSync(
      path.join(root, 'fixtures/vulnerable/src/bad.ts'),
      'utf8',
    )
    const project: ProjectModel = {
      root,
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
      envPrefixes: ['NEXT_PUBLIC_'],
      packageJsonScripts: {},
    }

    const lines = vuln.split('\n').map((content, i) => ({
      type: 'add' as const,
      content,
      newLineNumber: i + 1,
    }))

    const file: DiffFile = {
      path: 'src/bad.ts',
      status: 'A',
      language: 'typescript',
      riskDomains: ['api_routes'],
      hunks: [{ oldStart: 0, newStart: 1, lines }],
      baseContent: '',
      currentContent: vuln,
    }

    const authBase = 'requireRole("admin")\nreturn true\n'
    const authCurrent = fs.readFileSync(
      path.join(root, 'fixtures/vulnerable/src/auth/permissions.ts'),
      'utf8',
    )
    const authFile: DiffFile = {
      path: 'src/auth/permissions.ts',
      status: 'M',
      language: 'typescript',
      riskDomains: ['authorization', 'authentication'],
      hunks: [],
      baseContent: authBase,
      currentContent: authCurrent,
    }

    const findings = await runRules({
      project,
      policy: defaultPolicy,
      diff: { baseRef: 'base', headRef: 'head', files: [file, authFile], staged: false },
    })

    const ids = new Set(findings.map((f) => f.ruleId))
    expect(ids.has('sec.eval')).toBe(true)
    expect(ids.has('sec.child_process')).toBe(true)
    expect(ids.has('sec.tls_insecure')).toBe(true)
    expect(ids.has('sec.cors_star')).toBe(true)
    expect(ids.has('secret.hardcoded')).toBe(true)
    expect(ids.has('sec.open_redirect')).toBe(true)
    expect(ids.has('sec.path_traversal')).toBe(true)
    expect(ids.has('sec.unsafe_file_write')).toBe(true)
    expect(ids.has('sec.sensitive_logging')).toBe(true)
    expect(ids.has('sec.authz_check_removed')).toBe(true)
  })
})

describe('false-positive fixture', () => {
  it('ignores .env.example placeholders', async () => {
    const content = fs.readFileSync(
      path.join(root, 'fixtures/false-positives/.env.example'),
      'utf8',
    )
    const findings = await runRules({
      project: {
        root,
        runtime: 'node',
        language: 'typescript',
        packageManager: 'npm',
        frameworks: ['node'],
        build: { command: null, tool: null },
        test: { command: null, runner: null },
        lint: { command: null, tool: null },
        orm: 'none',
        monorepo: { kind: 'none', packages: [] },
        ci: { provider: 'none' },
        envPrefixes: [],
        packageJsonScripts: {},
      },
      policy: defaultPolicy,
      diff: {
        baseRef: 'base',
        headRef: 'head',
        staged: false,
        files: [
          {
            path: 'fixtures/false-positives/.env.example',
            status: 'A',
            language: 'env',
            riskDomains: ['environment_config'],
            hunks: [
              {
                oldStart: 0,
                newStart: 1,
                lines: content.split('\n').map((c, i) => ({
                  type: 'add' as const,
                  content: c,
                  newLineNumber: i + 1,
                })),
              },
            ],
            baseContent: '',
            currentContent: content,
          },
        ],
      },
    })
    expect(findings.filter((f) => f.ruleId === 'secret.hardcoded')).toHaveLength(0)
  })
})

describe('temp dir isolation', () => {
  it('handles non-git directories without crashing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-nogit-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }))
    const { report } = await runPipeline({
      cwd: dir,
      staged: false,
      json: true,
      sarif: false,
      ci: false,
      skipChecks: true,
    })
    expect(report.mergeStatus).toMatch(/PASS|REVIEW|BLOCKED/)
  })
})
