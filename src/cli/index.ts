import { Command } from 'commander'
import { recordBaseline } from '../baseline/run.js'
import { runPipeline } from '../core/pipeline.js'
import type { CliOptions } from '../core/types.js'
import { EXIT_ERROR } from '../core/exit-codes.js'
import { getVersion } from '../core/version.js'
import { createProgressRenderer, isInteractiveProgress } from './progress-ui.js'

function analyzeOptions(
  revision: string | undefined,
  opts: Record<string, unknown>,
  onProgress: CliOptions['onProgress'],
): CliOptions {
  return {
    cwd: String(opts.cwd ?? process.cwd()),
    base: typeof opts.base === 'string' ? opts.base : undefined,
    revision,
    staged: Boolean(opts.staged),
    json: Boolean(opts.json),
    sarif: Boolean(opts.sarif),
    html:
      opts.html === true
        ? 'agentproof-report.html'
        : typeof opts.html === 'string'
          ? opts.html
          : undefined,
    ci: Boolean(opts.ci),
    configPath: typeof opts.config === 'string' ? opts.config : undefined,
    skipChecks: Boolean(opts.skipChecks),
    verbose: Boolean(opts.verbose),
    onProgress,
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

  const options = analyzeOptions(revision, opts, (event) => renderer.handle(event))

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
    .command('baseline')
    .description('Record currently accepted findings as a committed baseline')
    .option('--staged', 'Analyze staged changes only', false)
    .option('--base <ref>', 'Base branch or commit (e.g. main)')
    .option('--config <path>', 'Path to agentproof config')
    .option('--cwd <path>', 'Working directory')
    .option('--skip-checks', 'Skip typecheck/lint/test/build (rules only)', false)
    .option('--verbose', 'Show commands, config, and extra progress detail', false)
    .action(async (opts: Record<string, unknown>, cmd) => {
      const parentCwd = cmd.parent?.opts().cwd as string | undefined
      const cwd = String(opts.cwd ?? parentCwd ?? process.cwd())
      try {
        const result = await recordBaseline({
          ...analyzeOptions(undefined, { ...opts, cwd, json: false, sarif: false }, undefined),
          cwd,
        })
        process.stdout.write(result.output.endsWith('\n') ? result.output : `${result.output}\n`)
        process.exitCode = result.exitCode
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'agentproof baseline failed with an unexpected error'
        process.stderr.write(`${message}\n`)
        process.exitCode = EXIT_ERROR
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
