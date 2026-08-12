import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
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

  it('records to policy.baseline.path instead of the default filename', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-baseline-path-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
    fs.writeFileSync(
      path.join(dir, 'agentproof.config.yaml'),
      'baseline:\n  path: accepted-findings.json\n',
    )
    const recorded = await recordBaseline({
      cwd: dir,
      staged: false,
      json: false,
      sarif: false,
      ci: false,
      skipChecks: true,
    })
    expect(recorded.path).toBe(path.join(dir, 'accepted-findings.json'))
    expect(fs.existsSync(path.join(dir, 'accepted-findings.json'))).toBe(true)
    expect(fs.existsSync(path.join(dir, '.agentproof-baseline.json'))).toBe(false)

    const { report } = await runPipeline({
      cwd: dir,
      staged: false,
      json: true,
      sarif: false,
      ci: false,
      skipChecks: true,
    })
    expect(report.baseline?.path).toBe('accepted-findings.json')
  })

  it('does not emit GitHub annotations for existing findings when new_issues_only is on', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-baseline-ann-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
    fs.mkdirSync(path.join(dir, 'src'))
    fs.writeFileSync(path.join(dir, 'src', 'app.ts'), 'export const ok = 1\n')
    const gitEnv = {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    }
    await execa('git', ['init'], { cwd: dir, env: gitEnv })
    await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, env: gitEnv })
    await execa('git', ['config', 'user.name', 'Test'], { cwd: dir, env: gitEnv })
    await execa('git', ['add', '.'], { cwd: dir, env: gitEnv })
    await execa('git', ['commit', '-m', 'init'], { cwd: dir, env: gitEnv })
    fs.writeFileSync(path.join(dir, 'src', 'app.ts'), 'eval(userInput)\n')

    const recorded = await recordBaseline({
      cwd: dir,
      staged: false,
      json: false,
      sarif: false,
      ci: false,
      skipChecks: true,
    })
    expect(recorded.count).toBeGreaterThan(0)

    process.env.GITHUB_ACTIONS = 'true'
    const lines: string[] = []
    const originalError = console.error
    console.error = (...args: unknown[]) => {
      lines.push(String(args[0] ?? ''))
    }
    try {
      const { report } = await runPipeline({
        cwd: dir,
        staged: false,
        json: true,
        sarif: false,
        ci: true,
        skipChecks: true,
      })
      expect(report.baseline?.existing).toBeGreaterThan(0)
      expect(report.baseline?.new).toBe(0)
      expect(report.mergeStatus).not.toBe('BLOCKED')
      expect(lines.some((line) => line.startsWith('::error') || line.startsWith('::warning'))).toBe(
        false,
      )
    } finally {
      console.error = originalError
      delete process.env.GITHUB_ACTIONS
    }
  })
})
