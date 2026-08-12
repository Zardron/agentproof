import { describe, expect, it } from 'vitest'
import { runRules } from '../../src/rules/registry.js'
import { defaultPolicy } from '../../src/policy/schema.js'
import type { DiffFile, NormalizedDiff, ProjectModel } from '../../src/core/types.js'

function baseProject(overrides: Partial<ProjectModel> = {}): ProjectModel {
  return {
    root: '/tmp/proj',
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
    envPrefixes: ['NEXT_PUBLIC_', 'VITE_'],
    packageJsonScripts: {},
    ...overrides,
  }
}

function diffWith(files: DiffFile[]): NormalizedDiff {
  return { baseRef: 'base', headRef: 'head', files, staged: false }
}

function file(partial: Partial<DiffFile> & Pick<DiffFile, 'path'>): DiffFile {
  return {
    status: 'M',
    language: 'typescript',
    riskDomains: ['other'],
    hunks: [],
    baseContent: '',
    currentContent: '',
    ...partial,
  }
}

describe('security rules', () => {
  it('flags eval additions', async () => {
    const findings = await runRules({
      project: baseProject(),
      policy: defaultPolicy,
      diff: diffWith([
        file({
          path: 'src/app.ts',
          hunks: [
            {
              oldStart: 1,
              newStart: 1,
              lines: [{ type: 'add', content: 'eval(userInput)', newLineNumber: 10 }],
            },
          ],
        }),
      ]),
    })
    expect(findings.some((f) => f.ruleId === 'sec.eval')).toBe(true)
  })

  it('flags tls insecure', async () => {
    const findings = await runRules({
      project: baseProject(),
      policy: defaultPolicy,
      diff: diffWith([
        file({
          path: 'src/http.ts',
          hunks: [
            {
              oldStart: 1,
              newStart: 1,
              lines: [
                {
                  type: 'add',
                  content: 'rejectUnauthorized: false',
                  newLineNumber: 4,
                },
              ],
            },
          ],
        }),
      ]),
    })
    expect(findings.some((f) => f.ruleId === 'sec.tls_insecure')).toBe(true)
  })

  it('does not flag placeholder secrets (false positive guard)', async () => {
    const findings = await runRules({
      project: baseProject(),
      policy: defaultPolicy,
      diff: diffWith([
        file({
          path: 'src/config.ts',
          hunks: [
            {
              oldStart: 1,
              newStart: 1,
              lines: [
                {
                  type: 'add',
                  content: "apiKey = 'YOUR_API_KEY_HERE'",
                  newLineNumber: 2,
                },
              ],
            },
          ],
        }),
      ]),
    })
    expect(findings.filter((f) => f.ruleId === 'secret.hardcoded')).toHaveLength(0)
  })

  it('flags hardcoded high-entropy secrets', async () => {
    const findings = await runRules({
      project: baseProject(),
      policy: defaultPolicy,
      diff: diffWith([
        file({
          path: 'src/config.ts',
          hunks: [
            {
              oldStart: 1,
              newStart: 1,
              lines: [
                {
                  type: 'add',
                  content: "api_key = 'hk_local_9f8e7d6c5b4a3210deadbeefcafebabe'",
                  newLineNumber: 2,
                },
              ],
            },
          ],
        }),
      ]),
    })
    expect(findings.some((f) => f.ruleId === 'secret.hardcoded')).toBe(true)
  })

  it('detects authz regression removal', async () => {
    const findings = await runRules({
      project: baseProject(),
      policy: defaultPolicy,
      diff: diffWith([
        file({
          path: 'src/auth/permissions.ts',
          riskDomains: ['authorization', 'authentication'],
          baseContent: 'export function gate() {\n  requireRole("admin")\n  return true\n}\n',
          currentContent: 'export function gate() {\n  return true\n}\n',
          hunks: [
            {
              oldStart: 1,
              newStart: 1,
              lines: [
                { type: 'del', content: '  requireRole("admin")', oldLineNumber: 2 },
              ],
            },
          ],
        }),
      ]),
    })
    expect(findings.some((f) => f.ruleId === 'sec.authz_check_removed')).toBe(true)
  })

  it('downgrades authz when relocated', async () => {
    const findings = await runRules({
      project: baseProject(),
      policy: defaultPolicy,
      diff: diffWith([
        file({
          path: 'src/auth/old.ts',
          baseContent: 'requireRole("admin")\n',
          currentContent: '',
          status: 'D',
        }),
        file({
          path: 'src/auth/new.ts',
          status: 'A',
          baseContent: '',
          currentContent: 'requireRole("admin")\n',
        }),
      ]),
    })
    const hit = findings.find((f) => f.ruleId === 'sec.authz_check_removed')
    expect(hit?.confidence).toBe('needs_review')
  })
})
