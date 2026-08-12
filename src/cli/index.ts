import { Command } from 'commander'
import readline from 'node:readline/promises'
import { runPipeline } from '../core/pipeline.js'
import type { CliOptions } from '../core/types.js'
import { EXIT_ERROR } from '../core/exit-codes.js'
import { getVersion } from '../core/version.js'
import { createProgressRenderer, isInteractiveProgress } from './progress-ui.js'
import { InitAbortedError, isInteractiveInit, runInit } from '../init/run.js'

async function confirmOverwrite(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  try {
    const answer = await rl.question(message)
    return /^y(es)?$/i.test(answer.trim())
  } finally {
    rl.close()
  }
}

async function runAnalyze(
  revision: string | undefined,
  opts: Record<string, unknown>,
): Promise<void> {
  const json = Boolean(opts.json)
  const sarif = Boolean(opts.sarif)
  const ci = Boolean(opts.ci)
  const interactive = isInteractiveProgress({
    ci,
    json,
    sarif,
    isTty: Boolean(process.stderr.isTTY),
  })

  const renderer = createProgressRenderer({
    interactive,
    stream: process.stderr,
  })

  const options: CliOptions = {
    cwd: String(opts.cwd ?? process.cwd()),
    base: typeof opts.base === 'string' ? opts.base : undefined,
    revision,
    staged: Boolean(opts.staged),
    json,
    sarif,
    html:
      opts.html === true
        ? 'agentproof-report.html'
        : typeof opts.html === 'string'
          ? opts.html
          : undefined,
    ci,
    configPath: typeof opts.config === 'string' ? opts.config : undefined,
    skipChecks: Boolean(opts.skipChecks),
    verbose: Boolean(opts.verbose),
    onProgress: (event) => renderer.handle(event),
  }

  const onSigint = () => {
    renderer.stop()
    process.exit(130)
  }
  const onExit = () => {
    renderer.stop()
  }
  process.on('SIGINT', onSigint)
  process.on('exit', onExit)

  renderer.header(getVersion())

  try {
    const { output, exitCode } = await runPipeline(options)
    process.stdout.write(output.endsWith('\n') ? output : `${output}\n`)
    process.exitCode = exitCode
  } catch {
    process.exitCode = EXIT_ERROR
  } finally {
    renderer.stop()
    process.off('SIGINT', onSigint)
    process.off('exit', onExit)
  }
}

async function main(): Promise<void> {
  const program = new Command()
  program
    .name('agentproof')
    .description('Verify code changes before they reach production.')
    .version(getVersion())

  program
    .command('init')
    .description('Inspect the repository and write a starter AgentProof config')
    .option('--force', 'Overwrite an existing AgentProof config', false)
    .option('--cwd <path>', 'Working directory')
    .action(async (opts: { force?: boolean; cwd?: string }, cmd) => {
      const parentCwd = cmd.parent?.opts().cwd as string | undefined
      const cwd = opts.cwd ?? parentCwd ?? process.cwd()
      const interactive = isInteractiveInit({
        isTty: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      })
      try {
        const result = await runInit({
          cwd,
          force: Boolean(opts.force),
          interactive,
          confirm: interactive ? confirmOverwrite : undefined,
        })
        process.stdout.write(result.output.endsWith('\n') ? result.output : `${result.output}\n`)
        process.exitCode = result.exitCode
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'agentproof init failed with an unexpected error'
        process.stderr.write(`${message}\n`)
        process.exitCode = err instanceof InitAbortedError ? err.exitCode : EXIT_ERROR
      }
    })

  program
    .argument('[revision]', 'Git revision to compare (e.g. HEAD~1)')
    .option('--staged', 'Analyze staged changes only', false)
    .option('--base <ref>', 'Base branch or commit (e.g. main)')
    .option('--json', 'Emit JSON report', false)
    .option('--sarif', 'Emit SARIF report', false)
    .option('--html [path]', 'Write a local HTML report', false)
    .option('--ci', 'CI mode (exit 1 when blocked)', false)
    .option('--config <path>', 'Path to agentproof config')
    .option('--cwd <path>', 'Working directory', process.cwd())
    .option('--skip-checks', 'Skip typecheck/lint/test/build (rules only)', false)
    .option('--verbose', 'Show commands, config, and extra progress detail', false)
    .action(async (revision: string | undefined, opts) => {
      await runAnalyze(revision, opts)
    })

  await program.parseAsync(process.argv)
}

main()
