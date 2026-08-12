import type { ReportModel } from '../core/types.js'

export function formatJson(report: ReportModel): string {
  return JSON.stringify(
    {
      tool: 'agentproof',
      version: '0.1.0',
      detected: {
        frameworks: report.project.frameworks,
        language: report.project.language,
        packageManager: report.project.packageManager,
      },
      changeRisk: report.changeRisk,
      productionReadiness: report.readiness,
      mergeStatus: report.mergeStatus,
      blockedReasons: report.blockedReasons,
      checks: report.checks,
      findings: report.findings,
      diff: {
        baseRef: report.diff.baseRef,
        headRef: report.diff.headRef,
        files: report.diff.files.map((f) => ({
          path: f.path,
          status: f.status,
          riskDomains: f.riskDomains,
        })),
      },
    },
    null,
    2,
  )
}
