import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  filterNewLintIssues,
  parseLintOutput,
} from '../../src/checks/lint.js'
import { loadPolicy } from '../../src/policy/schema.js'
import {
  listBuiltinPackNames,
  loadPack,
  mergePolicyLayers,
} from '../../src/policy/packs.js'
import type { NormalizedDiff } from '../../src/core/types.js'

describe('lint new-issues filter', () => {
  it('parses eslint-style output', () => {
    const issues = parseLintOutput(
      [
        'src/app.ts:10:5: Unexpected var',
        'src/other.ts(22,1): Missing semicolon',
      ].join('\n'),
    )
    expect(issues).toHaveLength(2)
    expect(issues[0]).toMatchObject({ file: 'src/app.ts', line: 10 })
    expect(issues[1]).toMatchObject({ file: 'src/other.ts', line: 22 })
  })

  it('keeps only issues on changed lines', () => {
    const diff: NormalizedDiff = {
      baseRef: 'base',
      headRef: 'head',
      staged: false,
      files: [
        {
          path: 'src/app.ts',
          status: 'M',
          language: 'typescript',
          riskDomains: ['other'],
          hunks: [
            {
              oldStart: 1,
              newStart: 8,
              lines: [
                { type: 'add', content: 'var x = 1', newLineNumber: 10 },
              ],
            },
          ],
          baseContent: '',
          currentContent: '',
        },
      ],
    }
    const issues = parseLintOutput(
      [
        'src/app.ts:10:1: Unexpected var',
        'src/app.ts:40:1: Old issue',
        'src/untouched.ts:1:1: Preexisting',
      ].join('\n'),
    )
    const neu = filterNewLintIssues(issues, diff)
    expect(neu).toHaveLength(1)
    expect(neu[0]?.line).toBe(10)
  })
})

describe('policy packs', () => {
  it('lists built-in packs', () => {
    expect(listBuiltinPackNames()).toEqual(
      expect.arrayContaining(['strict', 'security', 'relaxed', 'ci']),
    )
  })

  it('merges extends layers with local overrides', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-pack-'))
    fs.writeFileSync(
      path.join(dir, 'agentproof.config.yaml'),
      ['extends: security', 'fail_on: critical', 'require:', '  lint: true'].join(
        '\n',
      ),
    )
    const policy = await loadPolicy(dir)
    expect(policy.fail_on).toBe('critical')
    expect(policy.security.secret_detection).toBe(true)
    expect(policy.require.lint).toBe(true)
    expect(policy.require.typecheck).toBe(true)
  })

  it('loads a local YAML pack path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-pack-file-'))
    const packPath = path.join(dir, 'team.yaml')
    fs.writeFileSync(packPath, 'fail_on: medium\n')
    expect(loadPack(packPath, dir).fail_on).toBe('medium')
  })

  it('deep-merges objects', () => {
    const merged = mergePolicyLayers([
      { require: { typecheck: true, lint: false } },
      { require: { lint: true } },
    ])
    expect(merged.require).toEqual({ typecheck: true, lint: true })
  })
})
