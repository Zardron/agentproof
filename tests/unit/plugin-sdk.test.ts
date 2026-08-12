import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertSafePluginSpecifier,
  createFinding,
  definePlugin,
  defineRule,
  loadPluginRules,
} from '../../src/plugin/index.js'
import { runRules } from '../../src/rules/registry.js'
import { defaultPolicy } from '../../src/policy/schema.js'
import type { DiffFile, ProjectModel } from '../../src/core/types.js'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

function baseProject(root: string): ProjectModel {
  return {
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
  }
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

describe('plugin SDK safety', () => {
  it('rejects remote plugin specifiers', () => {
    expect(() => assertSafePluginSpecifier('https://evil.example/plugin.js')).toThrow(
      /Refusing to load remote plugin/,
    )
    expect(() => assertSafePluginSpecifier('git+https://evil.example/plugin.git')).toThrow(
      /Refusing to load remote plugin/,
    )
  })

  it('loads the example fixture and emits findings', async () => {
    const pluginPath = './fixtures/example-plugin/index.ts'
    const rules = await loadPluginRules(repoRoot, [pluginPath])
    expect(rules.map((r) => r.id)).toEqual(['example.no-console-log'])

    const findings = await runRules({
      project: baseProject(repoRoot),
      policy: { ...defaultPolicy, plugins: [pluginPath] },
      diff: {
        baseRef: 'base',
        headRef: 'head',
        staged: false,
        files: [
          file({
            path: 'src/app.ts',
            hunks: [
              {
                oldStart: 1,
                newStart: 1,
                lines: [{ type: 'add', content: 'console.log("debug")', newLineNumber: 3 }],
              },
            ],
          }),
        ],
      },
    })
    expect(findings.some((f) => f.ruleId === 'example.no-console-log')).toBe(true)
  })
})

describe('defineRule helpers', () => {
  it('builds findings and plugins', () => {
    const rule = defineRule({
      id: 'acme.demo',
      title: 'Demo',
      severity: 'low',
      analyze: () => [
        createFinding({
          ruleId: 'acme.demo',
          title: 'Demo',
          severity: 'low',
          message: 'hit',
          file: 'a.ts',
          line: 1,
        }),
      ],
    })
    const plugin = definePlugin({ name: 'acme', rules: [rule] })
    expect(plugin.name).toBe('acme')
    expect(plugin.rules[0]?.id).toBe('acme.demo')
  })

  it('fails when a plugin path is missing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-plugin-'))
    await expect(loadPluginRules(dir, ['./missing-plugin.ts'])).rejects.toThrow(/not found/)
  })
})
