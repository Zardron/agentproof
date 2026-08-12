import { describe, expect, it } from 'vitest'
import { classifyPath, isNonProductionPath, isTestPath } from '../../src/git/classify.js'
import { computeChangeRisk, computeReadiness, escalateSeverity } from '../../src/core/scoring.js'
import { applyPolicyToFindings, evaluateMergeStatus } from '../../src/policy/engine.js'
import { defaultPolicy } from '../../src/policy/schema.js'
import type { CheckResult, Finding } from '../../src/core/types.js'
import { detectPackageManager } from '../../src/detect/package-manager.js'
import { getVersion } from '../../src/core/version.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('classifyPath', () => {
  it('detects auth and authz domains', () => {
    expect(classifyPath('src/auth/permissions.ts')).toContain('authentication')
    expect(classifyPath('src/auth/permissions.ts')).toContain('authorization')
  })

  it('detects tests and fixtures', () => {
    expect(isTestPath('src/foo.test.ts')).toBe(true)
    expect(isTestPath('src/foo.ts')).toBe(false)
    expect(isTestPath('fixtures/vulnerable/src/bad.ts')).toBe(true)
  })

  it('skips scripts and rule sources as non-production', () => {
    expect(isNonProductionPath('scripts/check-version-bump.mjs')).toBe(true)
    expect(isNonProductionPath('src/rules/security/index.ts')).toBe(true)
    expect(isNonProductionPath('src/cli/index.ts')).toBe(false)
  })
})

describe('scoring', () => {
  it('escalates severity', () => {
    expect(escalateSeverity('high')).toBe('critical')
  })

  it('computes critical risk from critical findings', () => {
    const findings: Finding[] = [
      {
        id: '1',
        ruleId: 'sec.tls_insecure',
        title: 'tls',
        severity: 'critical',
        confidence: 'confirmed',
        message: 'tls off',
        evidence: {},
        category: 'security',
      },
    ]
    expect(computeChangeRisk(['other'], findings)).toBe('CRITICAL')
    expect(computeReadiness([], findings)).toBeLessThan(80)
  })
})

describe('policy engine', () => {
  it('blocks on high confirmed findings when fail_on=high', () => {
    const findings: Finding[] = [
      {
        id: '1',
        ruleId: 'sec.eval',
        title: 'eval',
        severity: 'high',
        confidence: 'confirmed',
        message: 'eval introduced',
        evidence: {},
        category: 'security',
      },
    ]
    const checks: CheckResult[] = []
    const result = evaluateMergeStatus(findings, checks, defaultPolicy)
    expect(result.status).toBe('BLOCKED')
  })

  it('applies severity overrides and ignore', () => {
    const findings: Finding[] = [
      {
        id: '1',
        ruleId: 'sec.eval',
        title: 'eval',
        severity: 'high',
        confidence: 'confirmed',
        message: 'eval',
        evidence: {},
        category: 'security',
      },
    ]
    const filtered = applyPolicyToFindings(findings, {
      ...defaultPolicy,
      ignore_rules: ['sec.eval'],
    })
    expect(filtered).toHaveLength(0)
  })
})

describe('package manager detection', () => {
  it('detects npm lock in this repo', () => {
    expect(detectPackageManager(root)).toBe('npm')
  })
})

describe('version', () => {
  it('reads the package version', () => {
    expect(getVersion()).toBe('0.3.1')
  })
})
