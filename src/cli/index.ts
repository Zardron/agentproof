import { Command } from 'commander'
import { runPipeline } from '../core/pipeline.js'
import type { CliOptions, ProgressStage } from '../core/types.js'
import { EXIT_ERROR } from '../core/exit-codes.js'
import { shouldDisplayProgressEvent } from '../core/progress.js'
import { getVersion } from '../core/version.js'
import {
  attachProgressCleanup,
  createProgressRenderer,
  isInteractiveProgress,
} from './progress-ui.js'

async function main(): Promise<void> {
  const program = new Command()
  program
    .name('agentproof')
    .description('Verify code changes before they reach production.')
    .version(getVersion())
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
      const json = Boolean(opts.json)
      const sarif = Boolean(opts.sarif)
      const ci = Boolean(opts.ci)
      const verbose = Boolean(opts.verbose)
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

      let lastStage: ProgressStage = 'config'
      let sawFailure = false
      const options: CliOptions = {
        cwd: opts.cwd,
        base: opts.base,
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
        configPath: opts.config,
        skipChecks: Boolean(opts.skipChecks),
        verbose,
        onProgress: (event) => {
          lastStage = event.stage
          if (event.status === 'failed') sawFailure = true
          if (!shouldDisplayProgressEvent(event, { verbose })) return
          renderer.handle(event)
        },
      }

      const detach = attachProgressCleanup(renderer)
      renderer.header(getVersion())

      try {
        const { output, exitCode } = await runPipeline(options)
        process.stdout.write(output.endsWith('\n') ? output : `${output}\n`)
        process.exitCode = exitCode
      } catch (err) {
        if (!sawFailure) renderer.fail(lastStage, err)
        process.exitCode = EXIT_ERROR
      } finally {
        detach()
      }
    })

  await program.parseAsync(process.argv)
}

main()
