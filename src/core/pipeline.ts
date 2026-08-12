import fs from 'node:fs'
import path from 'node:path'
import type { CliOptions, ProgressCallback, ReportModel } from './types.js'
import { detectProject } from '../detect/project.js'
import { describeProject } from '../detect/frameworks/index.js'
import { computeDiff } from '../git/diff-engine.js'
import { loadPolicy } from '../policy/schema.js'
import { applyPolicyToFindings, evaluateMergeStatus } from '../policy/engine.js'
import { runChecks } from '../checks/runner.js'
import { runRules } from '../rules/registry.js'
import { computeChangeRisk, computeReadiness } from './scoring.js'
import { formatTerminal } from '../reporters/terminal.js'
import { formatJson } from '../reporters/json.js'
import { formatSarif } from '../reporters/sarif.js'
import { formatHtml } from '../reporters/html.js'
import { emitGithubAnnotations } from '../reporters/github-annotations.js'
import { exitCodeForMergeStatus } from './exit-codes.js'
import { fetchAdvisoryFindings } from '../checks/advisories.js'
import { dependencyFindingInputs } from '../checks/dependencies.js'
import {
  STAGE_FAILURE_LABEL,
  diffCompletedMessage,
  diffRunningMessage,
  emitProgress,
  fileCountLabel,
  type ProgressStage,
} from './progress.js'

export async function runPipeline(options: CliOptions): Promise<{
  report: ReportModel
  exitCode: number
  output: string
}> {
  let stage: ProgressStage = 'config'
  const onProgress: ProgressCallback = (event) => {
    if (event.status === 'running') stage = event.stage
    options.onProgress?.(event)
  }

  try {
    emitProgress(onProgress, {
      stage: 'config',
      status: 'running',
      message: 'Loading configuration...',
    })
    const policy = await loadPolicy(options.cwd, options.configPath)
    emitProgress(onProgress, {
      stage: 'config',
      status: 'completed',
      message: 'Configuration loaded',
      detail: options.verbose
        ? options.configPath
          ? `Config ${options.configPath}`
          : 'Default policy search'
        : undefined,
    })

    emitProgress(onProgress, {
      stage: 'detect',
      status: 'running',
      message: 'Detecting project...',
    })
    const project = detectProject(options.cwd)
    emitProgress(onProgress, {
      stage: 'detect',
      status: 'completed',
      message: `Detected ${describeProject(project)}`,
    })

    emitProgress(onProgress, {
      stage: 'diff',
      status: 'running',
      message: diffRunningMessage(options),
    })
    const diff = await computeDiff({
      cwd: options.cwd,
      base: options.base,
      revision: options.revision,
      staged: options.staged,
    })
    emitProgress(onProgress, {
      stage: 'diff',
      status: 'completed',
      message: diffCompletedMessage(options),
      detail: fileCountLabel(diff.files.length),
    })

    const checks = await runChecks({
      project,
      policy,
      diff,
      skipChecks: options.skipChecks,
      verbose: options.verbose,
      onProgress,
      noCache: options.noCache,
    })

    emitProgress(onProgress, {
      stage: 'security',
      status: 'running',
      message: 'Running security analysis...',
    })
    let findings = await runRules({ project, policy, diff })
    const depInfo = dependencyFindingInputs(project, diff)
    const advisoryPkgs = [
      ...depInfo.added,
      ...depInfo.majors.map((m) => ({ name: m.name, version: m.to })),
    ]
    findings.push(
      ...(await fetchAdvisoryFindings(advisoryPkgs, policy.dependencies.advisories)),
    )
    findings = applyPolicyToFindings(findings, policy)
    emitProgress(onProgress, {
      stage: 'security',
      status: 'completed',
      message: 'Security analysis complete',
    })

    emitProgress(onProgress, {
      stage: 'risk',
      status: 'running',
      message: 'Calculating risk...',
    })
    const domains = diff.files.flatMap((f) => f.riskDomains)
    const changeRisk = computeChangeRisk(domains, findings)
    const readiness = computeReadiness(checks, findings)
    const { status: mergeStatus, blockedReasons } = evaluateMergeStatus(
      findings,
      checks,
      policy,
    )
    emitProgress(onProgress, {
      stage: 'risk',
      status: 'completed',
      message: 'Risk analysis complete',
    })

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

    if (options.html) {
      emitProgress(onProgress, {
        stage: 'html',
        status: 'running',
        message: 'Writing HTML report...',
      })
      const htmlPath = path.isAbsolute(options.html)
        ? options.html
        : path.join(options.cwd, options.html)
      fs.writeFileSync(htmlPath, formatHtml(report), 'utf8')
      emitProgress(onProgress, {
        stage: 'html',
        status: 'completed',
        message: `HTML report written to ${options.html}`,
      })
    }

    emitProgress(onProgress, {
      stage: 'report',
      status: 'running',
      message: 'Generating report...',
    })
    let output: string
    if (options.sarif) output = formatSarif(report)
    else if (options.json) output = formatJson(report)
    else output = formatTerminal(report)
    emitProgress(onProgress, {
      stage: 'report',
      status: 'completed',
      message: 'Report generated',
    })

    if (options.ci || project.ci.provider === 'github') {
      emitGithubAnnotations(findings)
    }

    const exitCode = exitCodeForMergeStatus(mergeStatus, options.ci)
    return { report, exitCode, output }
  } catch (err) {
    emitProgress(onProgress, {
      stage,
      status: 'failed',
      message: `Failed while ${STAGE_FAILURE_LABEL[stage]}`,
      detail: err instanceof Error ? err.message : undefined,
    })
    throw err
  }
}
