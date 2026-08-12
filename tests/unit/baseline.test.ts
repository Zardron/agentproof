import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fingerprintFinding, buildBaselineFile } from '../../src/baseline/fingerprint.js'
import { compareToBaseline, findingsForMergeDecision } from '../../src/baseline/compare.js'
import { readBaselineFile, writeBaselineFile } from '../../src/baseline/store.js'
import { recordBaseline } from '../../src/baseline/run.js'
import { runPipeline } from '../../src/core/pipeline.js'
import { evaluateMergeStatus } from '../../src/policy/engine.js'
import { defaultPolicy } from '../../src/policy/schema.js'
import type { Finding } from '../../src/core/types.js'

function finding(partial: Partial<Finding> & Pick<Finding, 'ruleId' | 'message'>): Finding {
  return {
    id: partial.id ?? `${partial.ruleId}-1`,
    title: partial.title ?? partial.ruleId,
    severity: partial.severity ?? 'high',
    confidence: partial.confidence ?? 'high',
    category: partial.category ?? 'security',
    evidence: partial.evidence ?? { currentSnippet: 'SECRET_VALUE=super-secret' },
    file: partial.file,
    line: partial.line,
    remediation: partial.remediation,
    ...partial,
  }
}

describe('baseline fingerprints', () => {
  it('ignores line movement and does not embed evidence secrets', () => {
    const a = finding({
      ruleId: 'sec.eval',
      file: 'src/app.ts',
      line: 10,
      message: 'eval() used',
    })
    const b = finding({
      ruleId: 'sec.eval',
      file: 'src/app.ts',
      line: 44,
      message: 'eval() used',
    })
    expect(fingerprintFinding(a)).toBe(fingerprintFinding(b))
    const file = buildBaselineFile([a])
    expect(JSON.stringify(file)).not.toContain('super-secret')
    expect(JSON.stringify(file)).not.toContain('SECRET_VALUE')
    expect(file.findings[0]?.file).toBe('src/app.ts')
  })

  it('is deterministic across write order', () => {
    const first = finding({ ruleId: 'sec.eval', file: 'b.ts', message: 'b' })
    const second = finding({ ruleId: 'sec.sql', file: 'a.ts', message: 'a' })
    expect(buildBaselineFile([first, second])).toEqual(buildBaselineFile([second, first]))
  })
})

describe('baseline compare', () => {
  it('detects new, existing, and resolved findings including deleted files', () => {
    const existing = finding({ ruleId: 'sec.eval', file: 'src/keep.ts', message: 'eval() used' })
    const removed = finding({ ruleId: 'sec.eval', file: 'src/deleted.ts', message: 'eval() used' })
    const added = finding({ ruleId: 'sec.sql', file: 'src/new.ts', message: 'sql concat' })
    const baseline = buildBaselineFile([existing, removed])
    const { findings, comparison } = compareToBaseline([existing, added], baseline, '.agentproof-baseline.json')
    expect(comparison.existing).toBe(1)
    expect(comparison.new).toBe(1)
    expect(comparison.resolved).toBe(1)
    expect(comparison.resolvedEntries[0]?.file).toBe('src/deleted.ts')
    expect(findings.find((f) => f.file === 'src/keep.ts')?.baselineStatus).toBe('existing')
    expect(findings.find((f) => f.file === 'src/new.ts')?.baselineStatus).toBe('new')
    expect(findingsForMergeDecision(findings).map((f) => f.file)).toEqual(['src/new.ts'])
  })
})

describe('baseline store and pipeline', () => {
  it('records a baseline and then only gates new findings', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-baseline-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
    const recorded = await recordBaseline({
      cwd: dir,
      staged: false,
      json: false,
      sarif: false,
      ci: false,
      skipChecks: true,
    })
    expect(recorded.exitCode).toBe(0)
    expect(fs.existsSync(path.join(dir, '.agentproof-baseline.json'))).toBe(true)
    const raw = fs.readFileSync(path.join(dir, '.agentproof-baseline.json'), 'utf8')
    expect(raw).not.toMatch(/sk-|AKIA|password|secret/i)

    const loaded = readBaselineFile(path.join(dir, '.agentproof-baseline.json'))
    expect(loaded?.version).toBe(1)

    const { report } = await runPipeline({
      cwd: dir,
      staged: false,
      json: true,
      sarif: false,
      ci: true,
      skipChecks: true,
    })
    expect(report.baseline).toBeDefined()
    expect(report.baseline?.existing).toBeGreaterThanOrEqual(0)
    expect(report.baseline?.new).toBe(0)
    expect(report.mergeStatus).not.toBe('BLOCKED')
  })

  it('keeps required-check failures blocking even with a baseline', () => {
    const existing = finding({
      ruleId: 'sec.eval',
      file: 'src/app.ts',
      message: 'eval() used',
      severity: 'high',
    })
    existing.baselineStatus = 'existing'
    const result = evaluateMergeStatus(
      findingsForMergeDecision([existing]),
      [
        {
          id: 'typecheck',
          title: 'Typecheck',
          status: 'failed',
          summary: 'Failed',
        },
      ],
      defaultPolicy,
    )
    expect(result.status).toBe('BLOCKED')
  })

  it('round-trips write/read without secrets', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-baseline-io-'))
    const filePath = path.join(dir, '.agentproof-baseline.json')
    const written = writeBaselineFile(filePath, [
      finding({
        ruleId: 'sec.eval',
        file: 'src/app.ts',
        message: 'eval() used',
        evidence: { currentSnippet: 'apiKey = "sk-live-123"' },
      }),
    ])
    const read = readBaselineFile(filePath)
    expect(read).toEqual(written)
    expect(fs.readFileSync(filePath, 'utf8')).not.toContain('sk-live-123')
  })
})
