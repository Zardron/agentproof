import type { CliOptions, ReportModel } from './types.js'
import { detectProject } from '../detect/project.js'
import { computeDiff } from '../git/diff-engine.js'
import { loadPolicy } from '../policy/schema.js'
import { applyPolicyToFindings, evaluateMergeStatus } from '../policy/engine.js'
import { runChecks } from '../checks/runner.js'
import { runRules } from '../rules/registry.js'
import { computeChangeRisk, computeReadiness } from './scoring.js'
import { formatTerminal } from '../reporters/terminal.js'
import { formatJson } from '../reporters/json.js'
import { formatSarif } from '../reporters/sarif.js'
import { emitGithubAnnotations } from '../reporters/github-annotations.js'
import { exitCodeForMergeStatus } from './exit-codes.js'

export async function runPipeline(options: CliOptions): Promise<{
  report: ReportModel
  exitCode: number
  output: string
}> {
  const policy = await loadPolicy(options.cwd, options.configPath)
  const project = detectProject(options.cwd)
  const diff = await computeDiff({
    cwd: options.cwd,
    base: options.base,
    revision: options.revision,
    staged: options.staged,
  })

  const checks = await runChecks({
    project,
    policy,
    diff,
    skipChecks: options.skipChecks,
  })

  let findings = await runRules({ project, policy, diff })
  findings = applyPolicyToFindings(findings, policy)

  const domains = diff.files.flatMap((f) => f.riskDomains)
  const changeRisk = computeChangeRisk(domains, findings)
  const readiness = computeReadiness(checks, findings)
  const { status: mergeStatus, blockedReasons } = evaluateMergeStatus(
    findings,
    checks,
    policy,
  )

  const report: ReportModel = {
    project,
    diff,
    checks,
    findings,
    changeRisk,
    readiness,
    mergeStatus,
    blockedReasons,
  }

  let output: string
  if (options.sarif) output = formatSarif(report)
  else if (options.json) output = formatJson(report)
  else output = formatTerminal(report)

  if (options.ci || project.ci.provider === 'github') {
    emitGithubAnnotations(findings)
  }

  const exitCode = exitCodeForMergeStatus(mergeStatus, options.ci)
  return { report, exitCode, output }
}
