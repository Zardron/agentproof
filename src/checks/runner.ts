import { execa } from 'execa'
import type { CheckResult, NormalizedDiff, ProgressCallback, ProgressStage, ProjectModel } from '../core/types.js'
import type { Policy } from '../policy/schema.js'
import {
  resolveBuildCommand,
  resolveLintCommand,
  resolveTestCommand,
  resolveTypecheckCommand,
} from '../adapters/commands.js'
import { runDependencyCheck } from './dependencies.js'
import { runLintCheck } from './lint.js'
import { affectedPackages, listWorkspacePackages } from '../detect/monorepo.js'
import {
  resolveWorkspaceScript,
  resolveWorkspaceTypecheck,
} from '../detect/workspace-project.js'
import { emitProgress, eventFromCheck } from '../core/progress.js'
import { collectWorkspaceFingerprint } from '../cache/fingerprint.js'
import { readCachedCheck, writeCachedCheck } from '../cache/store.js'

async function runCommand(
  id: string,
  title: string,
  command: string | null,
  cwd: string,
  required: boolean,
  timeoutMs = 120_000,
): Promise<CheckResult> {
  if (!command) {
    return {
      id,
      title,
      status: required ? 'failed' : 'skipped',
      summary: required ? 'Required but no command detected' : 'Skipped (not configured)',
    }
  }

  const start = Date.now()
  try {
    const result = await execa(command, {
      cwd,
      shell: true,
      reject: false,
      timeout: timeoutMs,
      env: { ...process.env, FORCE_COLOR: '0' },
    })
    const durationMs = Date.now() - start
    if (result.exitCode === 0) {
      return {
        id,
        title,
        status: 'passed',
        summary: 'Passed',
        durationMs,
      }
    }
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').slice(0, 4000)
    return {
      id,
      title,
      status: 'failed',
      summary: `Failed (exit ${result.exitCode})`,
      details,
      durationMs,
    }
  } catch (err) {
    return {
      id,
      title,
      status: 'failed',
      summary: err instanceof Error ? err.message : 'Command failed',
      durationMs: Date.now() - start,
    }
  }
}

function skippedChecks(): CheckResult[] {
  return [
    {
      id: 'typecheck',
      title: 'Typecheck',
      status: 'skipped',
      summary: 'Skipped (--skip-checks)',
    },
    {
      id: 'lint',
      title: 'Lint',
      status: 'skipped',
      summary: 'Skipped (--skip-checks)',
    },
    {
      id: 'tests',
      title: 'Tests',
      status: 'skipped',
      summary: 'Skipped (--skip-checks)',
    },
    {
      id: 'build',
      title: 'Build',
      status: 'skipped',
      summary: 'Skipped (--skip-checks)',
    },
    {
      id: 'dependencies',
      title: 'Dependencies',
      status: 'skipped',
      summary: 'Skipped (--skip-checks)',
    },
  ]
}

function aggregateStatus(
  results: CheckResult[],
): 'passed' | 'failed' | 'skipped' {
  if (results.some((r) => r.status === 'failed')) return 'failed'
  if (results.length === 0 || results.every((r) => r.status === 'skipped')) {
    return 'skipped'
  }
  return 'passed'
}

function runningMessage(
  title: string,
  command: string | null | undefined,
  verbose?: boolean,
): string {
  if (verbose && command) return `Running ${title.toLowerCase()} (${command})...`
  return `Running ${title.toLowerCase()}...`
}

function emitSkippedChecks(onProgress: ProgressCallback | undefined): CheckResult[] {
  const results = skippedChecks()
  for (const result of results) {
    const stage = result.id as ProgressStage
    emitProgress(onProgress, eventFromCheck(stage, result.title, result))
  }
  return results
}

async function withCheckProgress(
  onProgress: ProgressCallback | undefined,
  stage: ProgressStage,
  title: string,
  running: string,
  fn: () => Promise<CheckResult>,
  emitRunning = true,
): Promise<CheckResult> {
  if (emitRunning) {
    emitProgress(onProgress, { stage, status: 'running', message: running })
  }
  const result = await fn()
  emitProgress(onProgress, eventFromCheck(stage, title, result))
  return result
}

function aggregateDuration(results: CheckResult[]): number | undefined {
  const times = results
    .map((r) => r.durationMs)
    .filter((n): n is number => typeof n === 'number')
  if (times.length === 0) return undefined
  return times.reduce((a, b) => a + b, 0)
}

function joinedCommands(commands: Array<string | null>): string | null {
  const present = commands.filter((command): command is string => Boolean(command))
  return present.length > 0 ? present.join(' && ') : null
}

export async function runChecks(options: {
  project: ProjectModel
  policy: Policy
  diff: NormalizedDiff
  skipChecks: boolean
  verbose?: boolean
  onProgress?: ProgressCallback
  noCache?: boolean
}): Promise<CheckResult[]> {
  const { project, policy, diff, skipChecks, verbose, onProgress, noCache } = options
  if (skipChecks) return emitSkippedChecks(onProgress)

  const workspaceFingerprint = noCache ? '' : collectWorkspaceFingerprint(project.root)

  const runCached = async (
    stage: ProgressStage,
    title: string,
    command: string | null,
    running: string,
    fn: () => Promise<CheckResult>,
    emitRunning = true,
  ): Promise<CheckResult> => {
    if (!noCache) {
      const hit = readCachedCheck({
        cwd: project.root,
        checkId: stage,
        command,
        workspaceFingerprint,
      })
      if (hit) {
        emitProgress(onProgress, eventFromCheck(stage, title, hit))
        return hit
      }
    }
    return withCheckProgress(
      onProgress,
      stage,
      title,
      running,
      async () => {
        const result = await fn()
        if (!noCache) {
          writeCachedCheck({
            cwd: project.root,
            checkId: stage,
            command,
            workspaceFingerprint,
            result,
          })
        }
        return result
      },
      emitRunning,
    )
  }

  const packages = listWorkspacePackages(project.root)
  const affected = affectedPackages(diff, packages)
  const targets =
    project.monorepo.kind !== 'none' && affected.length > 0 ? affected : null

  if (targets) {
    const typecheck = await runCached(
      'typecheck',
      'Typecheck',
      joinedCommands(targets.map((pkg) => resolveWorkspaceTypecheck(project, pkg))),
      runningMessage('Typecheck', null, verbose),
      async () => {
        const typeResults: CheckResult[] = []
        for (const pkg of targets) {
          const typeCmd = resolveWorkspaceTypecheck(project, pkg)
          typeResults.push(
            await runCommand(
              `typecheck:${pkg.name}`,
              `Typecheck (${pkg.name})`,
              typeCmd,
              project.root,
              Boolean(typeCmd) && policy.require.typecheck,
            ),
          )
        }
        return {
          id: 'typecheck',
          title: 'Typecheck',
          status: aggregateStatus(typeResults),
          summary: `${typeResults.filter((r) => r.status === 'passed').length}/${targets.length} packages`,
          details:
            typeResults
              .filter((r) => r.status === 'failed')
              .map((r) => `${r.title}: ${r.summary}`)
              .join('\n') || undefined,
          durationMs: aggregateDuration(typeResults),
        }
      },
    )

    const lint = await runCached(
      'lint',
      'Lint',
      joinedCommands([
        ...targets.map((pkg) => resolveWorkspaceScript(project, pkg, 'lint')),
        resolveLintCommand(project),
      ]),
      runningMessage('Lint', resolveLintCommand(project), verbose),
      async () => {
        const lintResults: CheckResult[] = []
        for (const pkg of targets) {
          const lintCmd = resolveWorkspaceScript(project, pkg, 'lint')
          lintResults.push(
            await runLintCheck({
              command: lintCmd,
              cwd: project.root,
              required: Boolean(lintCmd) && policy.require.lint,
              diff,
              newIssuesOnly: policy.lint.new_issues_only,
              runCommand,
            }),
          )
        }
        if (lintResults.every((r) => r.status === 'skipped') && resolveLintCommand(project)) {
          lintResults.length = 0
          lintResults.push(
            await runLintCheck({
              command: resolveLintCommand(project),
              cwd: project.root,
              required: policy.require.lint,
              diff,
              newIssuesOnly: policy.lint.new_issues_only,
              runCommand,
            }),
          )
        }
        return {
          id: 'lint',
          title: 'Lint',
          status: aggregateStatus(lintResults),
          summary:
            lintResults.length === 1 && lintResults[0]?.id === 'lint'
              ? lintResults[0].summary
              : `${lintResults.filter((r) => r.status === 'passed').length}/${lintResults.length} packages`,
          details:
            lintResults
              .filter((r) => r.status === 'failed')
              .map((r) => `${r.title}: ${r.summary}`)
              .join('\n') || undefined,
          durationMs: aggregateDuration(lintResults),
        }
      },
    )

    const tests = await runCached(
      'tests',
      'Tests',
      joinedCommands(targets.map((pkg) => resolveWorkspaceScript(project, pkg, 'test'))),
      runningMessage('Tests', null, verbose),
      async () => {
        const testResults: CheckResult[] = []
        for (const pkg of targets) {
          const testCmd = resolveWorkspaceScript(project, pkg, 'test')
          testResults.push(
            await runCommand(
              `tests:${pkg.name}`,
              `Tests (${pkg.name})`,
              testCmd,
              project.root,
              Boolean(testCmd) && policy.require.tests,
              180_000,
            ),
          )
        }
        return {
          id: 'tests',
          title: 'Tests',
          status: aggregateStatus(testResults),
          summary: `${testResults.filter((r) => r.status === 'passed').length}/${targets.length} packages`,
          details:
            testResults
              .filter((r) => r.status === 'failed')
              .map((r) => `${r.title}: ${r.summary}`)
              .join('\n') || undefined,
          durationMs: aggregateDuration(testResults),
        }
      },
    )

    const build = await runCached(
      'build',
      'Build',
      joinedCommands(targets.map((pkg) => resolveWorkspaceScript(project, pkg, 'build'))),
      runningMessage('Build', null, verbose),
      async () => {
        const buildResults: CheckResult[] = []
        for (const pkg of targets) {
          const buildCmd = resolveWorkspaceScript(project, pkg, 'build')
          buildResults.push(
            await runCommand(
              `build:${pkg.name}`,
              `Build (${pkg.name})`,
              buildCmd,
              project.root,
              Boolean(buildCmd) && policy.require.build,
              180_000,
            ),
          )
        }
        return {
          id: 'build',
          title: 'Build',
          status: aggregateStatus(buildResults),
          summary: `${buildResults.filter((r) => r.status === 'passed').length}/${targets.length} packages`,
          details:
            buildResults
              .filter((r) => r.status === 'failed')
              .map((r) => `${r.title}: ${r.summary}`)
              .join('\n') || undefined,
          durationMs: aggregateDuration(buildResults),
        }
      },
    )

    const dependencies = await withCheckProgress(
      onProgress,
      'dependencies',
      'Dependencies',
      'Analyzing dependencies...',
      () => runDependencyCheck(project, diff),
    )

    return [typecheck, lint, tests, build, dependencies]
  }

  const typeCmd = resolveTypecheckCommand(project)
  const lintCmd = resolveLintCommand(project)
  const testCmd = resolveTestCommand(project)
  const buildCmd = resolveBuildCommand(project)

  return [
    await runCached(
      'typecheck',
      'Typecheck',
      typeCmd,
      runningMessage('Typecheck', typeCmd, verbose),
      () =>
        runCommand(
          'typecheck',
          'Typecheck',
          typeCmd,
          project.root,
          policy.require.typecheck,
        ),
      Boolean(typeCmd),
    ),
    await runCached(
      'lint',
      'Lint',
      lintCmd,
      runningMessage('Lint', lintCmd, verbose),
      () =>
        runLintCheck({
          command: lintCmd,
          cwd: project.root,
          required: policy.require.lint,
          diff,
          newIssuesOnly: policy.lint.new_issues_only,
          runCommand,
        }),
      Boolean(lintCmd),
    ),
    await runCached(
      'tests',
      'Tests',
      testCmd,
      runningMessage('Tests', testCmd, verbose),
      () =>
        runCommand(
          'tests',
          'Tests',
          testCmd,
          project.root,
          policy.require.tests,
          180_000,
        ),
      Boolean(testCmd),
    ),
    await runCached(
      'build',
      'Build',
      buildCmd,
      runningMessage('Build', buildCmd, verbose),
      () =>
        runCommand(
          'build',
          'Build',
          buildCmd,
          project.root,
          policy.require.build,
          180_000,
        ),
      Boolean(buildCmd),
    ),
    await withCheckProgress(
      onProgress,
      'dependencies',
      'Dependencies',
      'Analyzing dependencies...',
      () => runDependencyCheck(project, diff),
    ),
  ]
}
