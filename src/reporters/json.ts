import type { ReportModel } from '../core/types.js'
import { getVersion } from '../core/version.js'

export function formatJson(report: ReportModel): string {
  return JSON.stringify(
    {
      tool: 'agentproof',
      version: getVersion(),
      detected: {
        frameworks: report.project.frameworks,
        language: report.project.language,
        packageManager: report.project.packageManager,
        tests: report.project.test.runner,
        linter: report.project.lint.tool,
        orm: report.project.orm,
        monorepo: report.project.monorepo.kind,
      },
      changeRisk: report.changeRisk,
      productionReadiness: report.readiness,
      mergeStatus: report.mergeStatus,
      blockedReasons: report.blockedReasons,
      testImpact: report.testImpact,
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
