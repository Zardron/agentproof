import micromatch from 'micromatch'
import type {
  CheckResult,
  Finding,
  MergeStatus,
  Severity,
} from '../core/types.js'
import { escalateSeverity, severityRank } from '../core/scoring.js'
import type { Policy } from './schema.js'

const FAIL_ON_TO_RANK: Record<Policy['fail_on'], number> = {
  none: 99,
  low: severityRank('low'),
  medium: severityRank('medium'),
  high: severityRank('high'),
  critical: severityRank('critical'),
}

export function applyPolicyToFindings(
  findings: Finding[],
  policy: Policy,
): Finding[] {
  return findings
    .filter((f) => !policy.ignore_rules.includes(f.ruleId))
    .map((f) => {
      const override = policy.severity_overrides[f.ruleId]
      let severity: Severity = override ?? f.severity
      if (
        f.file &&
        policy.protected_areas.length > 0 &&
        micromatch.isMatch(f.file, policy.protected_areas)
      ) {
        severity = escalateSeverity(severity)
      }
      return { ...f, severity }
    })
}

export function evaluateMergeStatus(
  findings: Finding[],
  checks: CheckResult[],
  policy: Policy,
): { status: MergeStatus; blockedReasons: string[] } {
  const reasons: string[] = []
  const threshold = FAIL_ON_TO_RANK[policy.fail_on]

  for (const check of checks) {
    if (check.status !== 'failed') continue
    const required =
      (check.id === 'typecheck' && policy.require.typecheck) ||
      (check.id === 'build' && policy.require.build) ||
      (check.id === 'tests' && policy.require.tests) ||
      (check.id === 'lint' && policy.require.lint)
    if (required) {
      reasons.push(`Required check failed: ${check.title}`)
    }
  }

  const depPolicy = policy.dependencies.new_dependency
  const isAllowedDep = (finding: Finding) =>
    finding.ruleId === 'dep.new_package' && depPolicy === 'allow'

  let hasReview = false
  for (const finding of findings) {
    if (isAllowedDep(finding)) continue
    if (policy.fail_on !== 'none' && severityRank(finding.severity) >= threshold) {
      if (
        finding.confidence === 'needs_review' &&
        finding.severity !== 'critical'
      ) {
        hasReview = true
        continue
      }
      reasons.push(`${finding.ruleId}: ${finding.message}`)
    } else if (
      finding.confidence === 'needs_review' ||
      finding.severity === 'medium'
    ) {
      hasReview = true
    }
  }

  // dependency policy block / review (allow: findings ignored above)
  for (const finding of findings) {
    if (finding.ruleId !== 'dep.new_package') continue
    if (depPolicy === 'allow') continue
    if (depPolicy === 'block') {
      reasons.push(`Dependency policy block: ${finding.message}`)
    } else if (depPolicy === 'review' || depPolicy === 'warn') {
      hasReview = true
    }
  }

  if (reasons.length > 0) {
    return { status: 'BLOCKED', blockedReasons: [...new Set(reasons)] }
  }
  if (hasReview) {
    return { status: 'REVIEW', blockedReasons: [] }
  }
  return { status: 'PASS', blockedReasons: [] }
}
