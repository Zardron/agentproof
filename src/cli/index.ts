import { Command } from 'commander'
import { clearCheckCache } from '../cache/store.js'
import { CACHE_DIR_NAME } from '../cache/fingerprint.js'
import { runPipeline } from '../core/pipeline.js'
import { EXIT_ERROR } from '../core/exit-codes.js'
import { getVersion } from '../core/version.js'
import { applyAnalyzeFlags, cliOptionsFromCommander } from './analyze-options.js'
import { createProgressRenderer, isInteractiveProgress } from './progress-ui.js'

async function main(): Promise<void> {
  const program = new Command()
  program
    .name('agentproof')
    .description('Verify code changes before they reach production.')
    .version(getVersion())

  program
    .command('cache')
    .description('Manage the local incremental verification cache')
    .command('clear')
    .description('Delete the local AgentProof check cache')
    .option('--cwd <path>', 'Working directory')
    .action((opts: { cwd?: string }, cmd) => {
      const parentCwd = cmd.parent?.parent?.opts().cwd as string | undefined
      const cwd = opts.cwd ?? parentCwd ?? process.cwd()
      const result = clearCheckCache(cwd)
      const message = result.existed
        ? `Cleared ${CACHE_DIR_NAME}`
        : `No cache directory to clear (${CACHE_DIR_NAME})`
      process.stdout.write(`${message}\n`)
    })

  applyAnalyzeFlags(program.argument('[revision]', 'Git revision to compare (e.g. HEAD~1)')).action(
    async (revision: string | undefined, opts) => {
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

      const options = cliOptionsFromCommander(revision, opts, (event) => renderer.handle(event))

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
    },
  )

  await program.parseAsync(process.argv)
}

main()
