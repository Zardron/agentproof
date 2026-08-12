import { dependencyFindingInputs } from '../checks/dependencies.js'
import { isHighRiskDomain, isTestPath } from '../git/classify.js'
import type { Rule } from './interface.js'
import { makeFinding } from './interface.js'

export const depNewPackageRule: Rule = {
  id: 'dep.new_package',
  title: 'Dependency change',
  category: 'dependencies',
  severity: 'medium',
  confidence: 'high',
  supports: () => true,
  async run(ctx) {
    const info = dependencyFindingInputs(ctx.project, ctx.diff)
    if (!info.packageJsonChanged) return []
    const findings = []

    for (const a of info.added) {
      findings.push(
        makeFinding(depNewPackageRule, {
          message: `New dependency added: ${a.name}@${a.version}`,
          file: 'package.json',
          severity: 'medium',
          evidence: { currentSnippet: `"${a.name}": "${a.version}"` },
          remediation: 'Review the package source, maintainers, and whether it is necessary.',
        }),
      )
    }
    for (const m of info.majors) {
      findings.push(
        makeFinding(depNewPackageRule, {
          message: `Major version bump: ${m.name} ${m.from} → ${m.to}`,
          file: 'package.json',
          severity: 'medium',
          evidence: { baseSnippet: `${m.name}@${m.from}`, currentSnippet: `${m.name}@${m.to}` },
        }),
      )
    }
    for (const r of info.risky) {
      findings.push(
        makeFinding(depNewPackageRule, {
          message: `Risky dependency source: ${r.name}@${r.version}`,
          file: 'package.json',
          severity: 'high',
          evidence: { currentSnippet: `"${r.name}": "${r.version}"` },
          remediation: 'Avoid git/tarball dependencies in production when possible.',
        }),
      )
    }
    for (const life of info.lifecycle) {
      findings.push(
        makeFinding(depNewPackageRule, {
          message: `Lifecycle script changed: ${life}`,
          file: 'package.json',
          severity: 'high',
          evidence: { currentSnippet: `scripts.${life}` },
          remediation: 'Audit install lifecycle scripts carefully; they execute on install.',
        }),
      )
    }
    return findings
  },
}

export const untestedSensitiveRule: Rule = {
  id: 'risk.untested_sensitive',
  title: 'High-risk change without tests',
  category: 'risk',
  severity: 'medium',
  confidence: 'needs_review',
  supports: () => true,
  async run(ctx) {
    const sensitive = ctx.diff.files.filter(
      (f) =>
        !isTestPath(f.path) &&
        f.status !== 'D' &&
        f.riskDomains.some(isHighRiskDomain),
    )
    if (sensitive.length === 0) return []
    const testsTouched = ctx.diff.files.some((f) => isTestPath(f.path))
    if (testsTouched) return []

    return [
      makeFinding(untestedSensitiveRule, {
        message: `High-risk paths changed without accompanying test changes (${sensitive
          .slice(0, 3)
          .map((f) => f.path)
          .join(', ')}${sensitive.length > 3 ? ', …' : ''})`,
        file: sensitive[0]?.path,
        evidence: {
          currentSnippet: sensitive.map((f) => f.path).join('\n').slice(0, 300),
        },
        remediation: 'Add or update tests covering authentication, payments, or other sensitive behavior.',
      }),
    ]
  },
}
