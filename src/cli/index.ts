import { Command } from 'commander'
import { runPipeline } from '../core/pipeline.js'
import type { CliOptions } from '../core/types.js'
import { EXIT_ERROR } from '../core/exit-codes.js'

async function main(): Promise<void> {
  const program = new Command()
  program
    .name('agentproof')
    .description(
      'Verify code changes before they reach production.',
    )
    .version('0.1.0')
    .argument('[revision]', 'Git revision to compare (e.g. HEAD~1)')
    .option('--staged', 'Analyze staged changes only', false)
    .option('--base <ref>', 'Base branch or commit (e.g. main)')
    .option('--json', 'Emit JSON report', false)
    .option('--sarif', 'Emit SARIF report', false)
    .option('--ci', 'CI mode (exit 1 when blocked)', false)
    .option('--config <path>', 'Path to agentproof config')
    .option('--cwd <path>', 'Working directory', process.cwd())
    .option('--skip-checks', 'Skip typecheck/lint/test/build (rules only)', false)
    .action(async (revision: string | undefined, opts) => {
      const options: CliOptions = {
        cwd: opts.cwd,
        base: opts.base,
        revision,
        staged: Boolean(opts.staged),
        json: Boolean(opts.json),
        sarif: Boolean(opts.sarif),
        ci: Boolean(opts.ci),
        configPath: opts.config,
        skipChecks: Boolean(opts.skipChecks),
      }

      try {
        const { output, exitCode } = await runPipeline(options)
        process.stdout.write(output.endsWith('\n') ? output : `${output}\n`)
        process.exitCode = exitCode
      } catch (err) {
        console.error(
          err instanceof Error ? err.message : 'AgentProof failed with an unexpected error',
        )
        process.exitCode = EXIT_ERROR
      }
    })

  await program.parseAsync(process.argv)
}

main()
