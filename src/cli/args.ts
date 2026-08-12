import type { CliOptions } from '../core/types.js'

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    cwd: process.cwd(),
    staged: false,
    json: false,
    sarif: false,
    ci: false,
    skipChecks: false,
  }

  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--staged') opts.staged = true
    else if (a === '--json') opts.json = true
    else if (a === '--sarif') opts.sarif = true
    else if (a === '--ci') opts.ci = true
    else if (a === '--skip-checks') opts.skipChecks = true
    else if (a === '--html') {
      const next = argv[i + 1]
      if (next && !next.startsWith('-')) {
        opts.html = argv[++i]
      } else {
        opts.html = 'agentproof-report.html'
      }
    }
    else if (a === '--base') {
      opts.base = argv[++i]
    } else if (a === '--config') {
      opts.configPath = argv[++i]
    } else if (a === '--cwd') {
      opts.cwd = argv[++i] ?? opts.cwd
    } else if (a.startsWith('-')) {
      // unknown flags ignored here; commander handles help
    } else {
      rest.push(a)
    }
  }

  if (rest[0] && !opts.base && !opts.staged) {
    opts.revision = rest[0]
  }

  if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
    if (!argv.includes('--ci') && !argv.includes('--no-ci')) {
      // leave ci false unless --ci; users opt in for blocking behavior docs
    }
  }

  return opts
}
