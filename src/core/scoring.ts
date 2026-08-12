import type {
  ChangeRisk,
  CheckResult,
  Finding,
  RiskDomain,
  Severity,
} from './types.js'

const SEVERITY_ORDER: Severity[] = [
  'info',
  'low',
  'medium',
  'high',
  'critical',
]

const HIGH_RISK_DOMAINS: RiskDomain[] = [
  'authentication',
  'authorization',
  'payments',
  'billing',
  'customer_data',
  'database',
  'migrations',
  'environment_config',
  'infrastructure',
  'deployment',
  'dependencies',
]

export function severityRank(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s)
}

export function maxSeverity(
  a: Severity,
  b: Severity,
): Severity {
  return severityRank(a) >= severityRank(b) ? a : b
}

export function escalateSeverity(s: Severity): Severity {
  const i = severityRank(s)
  return SEVERITY_ORDER[Math.min(i + 1, SEVERITY_ORDER.length - 1)]!
}

export function computeChangeRisk(
  domains: RiskDomain[],
  findings: Finding[],
): ChangeRisk {
  const findingMax = findings.reduce<Severity>(
    (acc, f) => maxSeverity(acc, f.severity),
    'info',
  )
  if (findingMax === 'critical') return 'CRITICAL'
  if (findingMax === 'high') return 'HIGH'

  const hasHighDomain = domains.some((d) => HIGH_RISK_DOMAINS.includes(d))
  if (hasHighDomain || findingMax === 'medium') return 'HIGH'
  if (domains.includes('api_routes') || findingMax === 'low') return 'MEDIUM'
  return 'LOW'
}

export function computeReadiness(
  checks: CheckResult[],
  findings: Finding[],
): number {
  let score = 100

  for (const check of checks) {
    if (check.status === 'failed') {
      if (check.id === 'typecheck' || check.id === 'build' || check.id === 'tests') {
        score -= 20
      } else {
        score -= 10
      }
    }
  }

  for (const finding of findings) {
    const confMul =
      finding.confidence === 'confirmed'
        ? 1
        : finding.confidence === 'high'
          ? 0.85
          : 0.4
    const base =
      finding.severity === 'critical'
        ? 25
        : finding.severity === 'high'
          ? 15
          : finding.severity === 'medium'
            ? 8
            : finding.severity === 'low'
              ? 3
              : 1
    score -= Math.round(base * confMul)
  }

  return Math.max(0, Math.min(100, score))
}
