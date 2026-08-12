import { Command } from 'commander'
import type { CliOptions } from '../core/types.js'

export function applyAnalyzeFlags(command: Command): Command {
  return command
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
    .option('--no-cache', 'Disable the incremental check cache')
}

export function cliOptionsFromCommander(
  revision: string | undefined,
  opts: Record<string, unknown>,
  onProgress?: CliOptions['onProgress'],
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
    // Commander `--no-cache` sets `cache: false`. Do not default that option to false
    // or cache is disabled even when the flag is omitted.
    noCache: opts.cache === false,
    onProgress,
  }
}

export function parseAnalyzeArgv(argv: string[]): CliOptions {
  const program = new Command()
  program.exitOverride()
  applyAnalyzeFlags(program)
  program.parse(argv, { from: 'user' })
  return cliOptionsFromCommander(undefined, program.opts())
}
