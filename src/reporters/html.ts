import type { Finding, ReportModel } from '../core/types.js'
import { getVersion } from '../core/version.js'
import { describeProject } from '../detect/frameworks/index.js'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function statusClass(status: string): string {
  if (status === 'BLOCKED' || status === 'failed' || status === 'critical' || status === 'high') {
    return 'bad'
  }
  if (status === 'REVIEW' || status === 'warned' || status === 'medium') return 'warn'
  return 'ok'
}

export function formatHtml(report: ReportModel): string {
  const findings = report.findings
    .map(
      (f: Finding) => `
      <tr>
        <td><code>${escapeHtml(f.ruleId)}</code></td>
        <td class="${statusClass(f.severity)}">${escapeHtml(f.severity)}</td>
        <td>${escapeHtml(f.confidence)}</td>
        <td>${escapeHtml(f.file ?? '')}${f.line ? `:${f.line}` : ''}</td>
        <td>${escapeHtml(f.message)}</td>
      </tr>`,
    )
    .join('')

  const checks = report.checks
    .map(
      (c) => `
      <tr>
        <td>${escapeHtml(c.title)}</td>
        <td class="${statusClass(c.status)}">${escapeHtml(c.status)}</td>
        <td>${escapeHtml(c.summary)}</td>
      </tr>`,
    )
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>AgentProof ${escapeHtml(getVersion())} report</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 32px; color: #111; background: #fafafa; }
    h1 { margin: 0 0 8px; }
    .meta { color: #555; margin-bottom: 24px; }
    .card { background: #fff; border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px 20px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #eee; vertical-align: top; font-size: 14px; }
    .ok { color: #157347; font-weight: 600; }
    .warn { color: #9a6700; font-weight: 600; }
    .bad { color: #b42318; font-weight: 600; }
    code { font-size: 12px; }
  </style>
</head>
<body>
  <h1>AgentProof ${escapeHtml(getVersion())}</h1>
  <p class="meta">${escapeHtml(describeProject(report.project))}</p>
  <div class="card">
    <p>Change risk: <strong>${escapeHtml(report.changeRisk)}</strong></p>
    <p>Production readiness: <strong>${report.readiness}/100</strong></p>
    <p>Merge status: <span class="${statusClass(report.mergeStatus)}">${escapeHtml(report.mergeStatus)}</span></p>
  </div>
  <div class="card">
    <h2>Checks</h2>
    <table>
      <thead><tr><th>Check</th><th>Status</th><th>Summary</th></tr></thead>
      <tbody>${checks || '<tr><td colspan="3">None</td></tr>'}</tbody>
    </table>
  </div>
  <div class="card">
    <h2>Findings</h2>
    <table>
      <thead><tr><th>Rule</th><th>Severity</th><th>Confidence</th><th>Location</th><th>Message</th></tr></thead>
      <tbody>${findings || '<tr><td colspan="5">No findings</td></tr>'}</tbody>
    </table>
  </div>
</body>
</html>
`
}
