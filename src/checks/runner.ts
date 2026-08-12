import { execa } from 'execa'
import type { CheckResult, NormalizedDiff, ProjectModel } from '../core/types.js'
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

export async function runChecks(options: {
  project: ProjectModel
  policy: Policy
  diff: NormalizedDiff
  skipChecks: boolean
}): Promise<CheckResult[]> {
  const { project, policy, diff, skipChecks } = options
  if (skipChecks) return skippedChecks()

  const packages = listWorkspacePackages(project.root)
  const affected = affectedPackages(diff, packages)
  const targets =
    project.monorepo.kind !== 'none' && affected.length > 0 ? affected : null

  if (targets) {
    const typeResults: CheckResult[] = []
    const lintResults: CheckResult[] = []
    const testResults: CheckResult[] = []
    const buildResults: CheckResult[] = []

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

    // Fall back to root lint when no affected package defines lint.
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

    const typeStatus = aggregateStatus(typeResults)
    const lintStatus = aggregateStatus(lintResults)
    const testStatus = aggregateStatus(testResults)
    const buildStatus = aggregateStatus(buildResults)

    return [
      {
        id: 'typecheck',
        title: 'Typecheck',
        status: typeStatus,
        summary: `${typeResults.filter((r) => r.status === 'passed').length}/${targets.length} packages`,
        details: typeResults
          .filter((r) => r.status === 'failed')
          .map((r) => `${r.title}: ${r.summary}`)
          .join('\n') || undefined,
      },
      {
        id: 'lint',
        title: 'Lint',
        status: lintStatus,
        summary:
          lintResults.length === 1 && lintResults[0]?.id === 'lint'
            ? lintResults[0].summary
            : `${lintResults.filter((r) => r.status === 'passed').length}/${lintResults.length} packages`,
        details: lintResults
          .filter((r) => r.status === 'failed')
          .map((r) => `${r.title}: ${r.summary}`)
          .join('\n') || undefined,
      },
      {
        id: 'tests',
        title: 'Tests',
        status: testStatus,
        summary: `${testResults.filter((r) => r.status === 'passed').length}/${targets.length} packages`,
        details: testResults
          .filter((r) => r.status === 'failed')
          .map((r) => `${r.title}: ${r.summary}`)
          .join('\n') || undefined,
      },
      {
        id: 'build',
        title: 'Build',
        status: buildStatus,
        summary: `${buildResults.filter((r) => r.status === 'passed').length}/${targets.length} packages`,
        details: buildResults
          .filter((r) => r.status === 'failed')
          .map((r) => `${r.title}: ${r.summary}`)
          .join('\n') || undefined,
      },
      await runDependencyCheck(project, diff),
    ]
  }

  return [
    await runCommand(
      'typecheck',
      'Typecheck',
      resolveTypecheckCommand(project),
      project.root,
      policy.require.typecheck,
    ),
    await runLintCheck({
      command: resolveLintCommand(project),
      cwd: project.root,
      required: policy.require.lint,
      diff,
      newIssuesOnly: policy.lint.new_issues_only,
      runCommand,
    }),
    await runCommand(
      'tests',
      'Tests',
      resolveTestCommand(project),
      project.root,
      policy.require.tests,
      180_000,
    ),
    await runCommand(
      'build',
      'Build',
      resolveBuildCommand(project),
      project.root,
      policy.require.build,
      180_000,
    ),
    await runDependencyCheck(project, diff),
  ]
}
