import chalk from 'chalk'
import type { CheckResult, Finding, ReportModel } from '../core/types.js'
import { describeProject } from '../detect/frameworks/index.js'

function icon(status: CheckResult['status']): string {
  if (status === 'passed') return chalk.green('✓')
  if (status === 'failed') return chalk.red('✗')
  if (status === 'warned') return chalk.yellow('⚠')
  return chalk.gray('·')
}

function findingIcon(f: Finding): string {
  if (f.severity === 'critical' || f.severity === 'high') return chalk.red('✗')
  if (f.severity === 'medium') return chalk.yellow('⚠')
  return chalk.gray('•')
}

export function formatTerminal(report: ReportModel): string {
  const lines: string[] = []
  lines.push(chalk.bold('AgentProof'))
  lines.push('──────────────────────────────────')
  lines.push('')
  lines.push(`Detected: ${describeProject(report.project)}`)
  lines.push('')
  lines.push(
    `Change Risk               ${chalk.bold(report.changeRisk)}`,
  )
  lines.push(
    `Production Readiness      ${chalk.bold(`${report.readiness}/100`)}`,
  )
  lines.push('')

  for (const check of report.checks) {
    if (check.id === 'dependencies') continue
    const label = check.title.padEnd(24, ' ')
    lines.push(`${icon(check.status)} ${label}${check.summary}`)
  }

  lines.push('')

  const byRule = new Map<string, Finding[]>()
  for (const f of report.findings) {
    const list = byRule.get(f.ruleId) ?? []
    list.push(f)
    byRule.set(f.ruleId, list)
  }

  if (report.findings.length === 0) {
    lines.push(`${chalk.green('✓')} No security findings`)
  } else {
    for (const [ruleId, group] of byRule) {
      const sample = group[0]!
      lines.push(
        `${findingIcon(sample)} ${sample.title.padEnd(24, ' ')}${group.length}`,
      )
      void ruleId
    }
  }

  lines.push('')
  lines.push('MERGE STATUS')
  lines.push('')
  if (report.mergeStatus === 'BLOCKED') {
    lines.push(chalk.red.bold('BLOCKED'))
    for (const reason of report.blockedReasons.slice(0, 8)) {
      lines.push(`  - ${reason}`)
    }
  } else if (report.mergeStatus === 'REVIEW') {
    lines.push(chalk.yellow.bold('REVIEW'))
  } else {
    lines.push(chalk.green.bold('PASS'))
  }
  lines.push('')
  return lines.join('\n')
}
