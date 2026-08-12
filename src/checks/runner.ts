import { execa } from 'execa'
import type { CheckResult, ProjectModel } from '../core/types.js'
import type { Policy } from '../policy/schema.js'
import {
  resolveBuildCommand,
  resolveLintCommand,
  resolveTestCommand,
  resolveTypecheckCommand,
} from '../adapters/commands.js'
import { runDependencyCheck } from './dependencies.js'
import type { NormalizedDiff } from '../core/types.js'

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

export async function runChecks(options: {
  project: ProjectModel
  policy: Policy
  diff: NormalizedDiff
  skipChecks: boolean
}): Promise<CheckResult[]> {
  const { project, policy, diff, skipChecks } = options
  if (skipChecks) {
    return [
      {
        id: 'typecheck',
        title: 'Typecheck',
        status: 'skipped',
        summary: 'Skipped (--skip-checks)',
      },
    ]
  }

  const checks: CheckResult[] = []

  checks.push(
    await runCommand(
      'typecheck',
      'Typecheck',
      resolveTypecheckCommand(project),
      project.root,
      policy.require.typecheck,
    ),
  )

  checks.push(
    await runCommand(
      'lint',
      'Lint',
      resolveLintCommand(project),
      project.root,
      policy.require.lint,
    ),
  )

  checks.push(
    await runCommand(
      'tests',
      'Tests',
      resolveTestCommand(project),
      project.root,
      policy.require.tests,
      180_000,
    ),
  )

  checks.push(
    await runCommand(
      'build',
      'Build',
      resolveBuildCommand(project),
      project.root,
      policy.require.build,
      180_000,
    ),
  )

  checks.push(await runDependencyCheck(project, diff))

  return checks
}
