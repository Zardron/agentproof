import fs from 'node:fs'
import type { Finding, MergeStatus, Severity } from '../core/types.js'
import { isGithubActions } from '../ci/detect.js'

export const MAX_GITHUB_ANNOTATIONS = 20

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
}

function escapeData(s: string): string {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
}

function annotationLevel(severity: Severity): 'error' | 'warning' | 'notice' {
  if (severity === 'critical' || severity === 'high') return 'error'
  if (severity === 'medium') return 'warning'
  return 'notice'
}

function truncate(message: string, max = 160): string {
  const compact = message.replace(/\s+/g, ' ').trim()
  if (compact.length <= max) return compact
  return `${compact.slice(0, max - 1)}…`
}

export function formatGithubAnnotation(finding: Finding): string {
  const level = annotationLevel(finding.severity)
  const file = finding.file ? `file=${escapeData(finding.file)}` : ''
  const line = finding.line ? `line=${finding.line}` : ''
  const title = `title=${escapeData(`AgentProof: ${finding.title}`)}`
  const props = [file, line, title].filter(Boolean).join(',')
  const body = escapeData(
    truncate(`AgentProof: ${finding.message} Risk: ${finding.severity.toUpperCase()}`),
  )
  return `::${level} ${props}::${body}`
}

export function selectGithubAnnotations(findings: Finding[]): {
  selected: Finding[]
  omitted: number
} {
  const ranked = [...findings].sort((a, b) => {
    const rank = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
    if (rank !== 0) return rank
    return (a.file ?? '').localeCompare(b.file ?? '')
  })
  const selected = ranked.slice(0, MAX_GITHUB_ANNOTATIONS)
  return { selected, omitted: Math.max(0, ranked.length - selected.length) }
}

export function formatGithubSummary(options: {
  mergeStatus?: MergeStatus
  findings: Finding[]
  omitted: number
}): string {
  const errors = options.findings.filter((f) => f.severity === 'critical' || f.severity === 'high').length
  const warnings = options.findings.filter((f) => f.severity === 'medium').length
  const notices = options.findings.length - errors - warnings
  const lines = [
    '## AgentProof',
    '',
    options.mergeStatus ? `Merge status: **${options.mergeStatus}**` : '',
    '',
    `| Severity | Count |`,
    `| --- | ---: |`,
    `| Errors (critical/high) | ${errors} |`,
    `| Warnings (medium) | ${warnings} |`,
    `| Notices | ${notices} |`,
  ].filter((line) => line !== '')
  if (options.omitted > 0) {
    lines.push('')
    lines.push(
      `${options.omitted} additional finding${options.omitted === 1 ? '' : 's'} omitted from inline annotations (cap ${MAX_GITHUB_ANNOTATIONS}).`,
    )
  }
  lines.push('')
  return lines.join('\n')
}

export function emitGithubAnnotations(
  findings: Finding[],
  options: { mergeStatus?: MergeStatus; write?: (line: string) => void } = {},
): void {
  if (!isGithubActions()) return
  const write = options.write ?? ((line: string) => console.error(line))
  const { selected, omitted } = selectGithubAnnotations(findings)
  for (const finding of selected) {
    write(formatGithubAnnotation(finding))
  }
  if (omitted > 0) {
    write(
      `::notice title=AgentProof::${escapeData(
        `${omitted} additional findings omitted to avoid flooding this pull request.`,
      )}`,
    )
  }
  const summaryFile = process.env.GITHUB_STEP_SUMMARY
  if (summaryFile) {
    try {
      fs.appendFileSync(
        summaryFile,
        formatGithubSummary({
          mergeStatus: options.mergeStatus,
          findings,
          omitted,
        }),
        'utf8',
      )
    } catch {
      /* job summary is optional */
    }
  }
}
