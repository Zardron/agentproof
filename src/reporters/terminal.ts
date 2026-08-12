import chalk from 'chalk'
import type { CheckResult, Finding, ProjectModel, ReportModel } from '../core/types.js'
import { describeProject } from '../detect/frameworks/index.js'
import { getVersion } from '../core/version.js'

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

function labelValue(label: string, value: string): string {
  return `${label.padEnd(18, ' ')}${value}`
}

export function formatDetectedProject(project: ProjectModel): string {
  const framework =
    project.frameworks.filter((id) => id !== 'node').join(' + ') || 'Node.js'
  const language =
    project.language === 'typescript'
      ? 'TypeScript'
      : project.language === 'javascript'
        ? 'JavaScript'
        : 'TypeScript/JavaScript'
  const tests = project.test.runner
    ? project.test.runner === 'node'
      ? 'Node test runner'
      : project.test.runner
    : 'none'
  const linter = project.lint.tool ?? 'none'
  const orm = project.orm === 'none' ? 'none' : project.orm
  const monorepo =
    project.monorepo.kind === 'none'
      ? 'none'
      : `${project.monorepo.kind} (${project.monorepo.packages.length} packages)`

  return [
    'Detected Project',
    '──────────────────────────',
    labelValue('Runtime', 'Node.js'),
    labelValue('Language', language),
    labelValue('Framework', framework),
    labelValue('Package Manager', project.packageManager),
    labelValue('Tests', tests),
    labelValue('Linter', linter),
    labelValue('ORM', orm),
    labelValue('Monorepo', monorepo),
  ].join('\n')
}

export function formatTerminal(report: ReportModel): string {
  const lines: string[] = []
  lines.push(chalk.bold(`AgentProof ${getVersion()}`))
  lines.push('──────────────────────────────────')
  lines.push('')
  lines.push(formatDetectedProject(report.project))
  lines.push('')
  lines.push(`Detected: ${describeProject(report.project)}`)
  lines.push('')
  lines.push(`Change Risk               ${chalk.bold(report.changeRisk)}`)
  lines.push(
    `Production Readiness      ${chalk.bold(`${report.readiness}/100`)}`,
  )
  if (report.baseline) {
    lines.push('')
    lines.push('Baseline')
    lines.push('──────────────────────────')
    lines.push(`Existing baseline findings    ${report.baseline.existing}`)
    lines.push(`New findings                   ${report.baseline.new}`)
    lines.push(`Resolved findings              ${report.baseline.resolved}`)
  }
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
    for (const [, group] of byRule) {
      const sample = group[0]!
      lines.push(
        `${findingIcon(sample)} ${sample.title.padEnd(24, ' ')}${group.length}`,
      )
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
