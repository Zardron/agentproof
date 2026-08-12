# AgentProof

**Verify code changes before they reach production.**

AgentProof is a framework-aware, CI-friendly verification CLI for Node.js / TypeScript projects. It analyzes a git diff — not who wrote the code — and reports whether the change is safe to merge.

It runs typecheck, lint, tests, and build when configured; scans for secrets and high-confidence security issues; detects authentication / authorization regressions vs the base branch; and can block CI when policy thresholds are exceeded.

## Features

- Automatic project detection (package manager, frameworks, build/test/lint commands)
- Diff-aware risk classification (auth, payments, deps, migrations, and more)
- Checks: typecheck, lint, tests, build, dependency changes
- Security rules with evidence (secrets, eval, shell, SQL, CORS, TLS, redirects, and more)
- Auth / authz regression detection against the base branch
- Policy config (`fail_on`, protected paths, required checks)
- Reporters: terminal, JSON, SARIF, local HTML, GitHub annotations
- Optional OSV advisory enrichment for new/upgraded dependencies (package name/version only — never source)
- GitHub Action for pull-request gates

## Installation

```bash
npm install -D agentproof-cli
```

Also works with:

```bash
pnpm add -D agentproof-cli
yarn add -D agentproof-cli
```

> **Note:** The npm name `agentproof` is a different, unrelated package. This tool is published as **`agentproof-cli`**. After install, the CLI command is still `agentproof`.

## Quick start

```bash
npx agentproof-cli
npx agentproof-cli --base main --ci
```

Or after a local/devDependency install:

```bash
agentproof --help
agentproof --base main --ci
agentproof --staged
agentproof --json
agentproof --sarif
agentproof --html ./agentproof-report.html
agentproof --config agentproof.config.yaml
```

## CLI

| Command / flag | Description |
|----------------|-------------|
| `agentproof` | Analyze changes vs default base (or working tree) |
| `agentproof HEAD~1` | Compare against a revision |
| `--base <ref>` | Base branch or commit (e.g. `main`) |
| `--staged` | Analyze staged changes only |
| `--json` | Emit JSON report |
| `--sarif` | Emit SARIF report |
| `--html [path]` | Write a local HTML report |
| `--ci` | CI mode (exit `1` when merge is blocked) |
| `--config <path>` | Path to config file |
| `--cwd <path>` | Working directory |
| `--skip-checks` | Skip typecheck/lint/test/build (rules only) |
| `--help` / `--version` | Help and version |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Pass or review (non-blocking) |
| `1` | Blocked (when `--ci`) |
| `2` | Unexpected error |

## Configuration

Create `agentproof.config.yaml` (also supports `.yml`, `.json`, `.ts`, or `package.json#agentproof`):

```yaml
extends: security   # built-ins: strict | security | relaxed | ci — or ./team-pack.yaml

fail_on: high

protected_areas:
  - "src/auth/**"
  - "src/payments/**"
  - "prisma/migrations/**"

require:
  build: true
  tests: true
  typecheck: true
  lint: false

lint:
  new_issues_only: true   # only fail on lint issues on changed lines

dependencies:
  new_dependency: review
  advisories: true

security:
  secret_detection: true
  auth_regression: true

ignore_rules: []
severity_overrides: {}
```

See [RULES.md](./RULES.md) for the full rule catalog.

## Programmatic API

```js
import { runPipeline, getVersion } from 'agentproof-cli'

const { report, exitCode, output } = await runPipeline({
  cwd: process.cwd(),
  base: 'main',
  staged: false,
  json: true,
  sarif: false,
  ci: true,
  skipChecks: false,
})

console.log(getVersion())
console.log(report.mergeStatus)
process.exitCode = exitCode
```

### Exports

| Export | Description |
|--------|-------------|
| `runPipeline(options)` | Run the full analysis pipeline |
| `detectProject(root)` | Detect runtime/framework/tooling |
| `describeProject(project)` | Human-readable project summary |
| `loadPolicy(cwd, configPath?)` | Load policy config |
| `defaultPolicy` / `policySchema` | Default policy and Zod schema |
| `getVersion()` | Package version string |
| `exitCodeForMergeStatus(...)` | Map merge status to exit code |
| Types | `CliOptions`, `ReportModel`, `Finding`, `ProjectModel`, … |

## GitHub Actions

```yaml
- uses: Zardron/agentproof@v0.3.0
  with:
    base: origin/main
    fail-on: high
```

Or install the published package in your own workflow:

```yaml
- run: npm install -D agentproof-cli
- run: npx agentproof --base origin/main --ci
```

## Supported ecosystem

- **Runtime:** Node.js · TypeScript · JavaScript
- **Package managers:** npm · pnpm · Yarn · Bun
- **Frameworks:** Node · Express · Fastify · Hono · NestJS · React/Vite · Next.js · Remix · Astro · Nuxt · Vue · SvelteKit · Angular

Detection is automatic. No framework flag is required for normal use.

## Requirements

- **Node.js 20+**
- A git repository (for diff analysis)
- Network access only if OSV advisories are enabled (optional; sends package name/version only)

## TypeScript

Type declarations ship with the package (`dist/index.d.ts`). No `@types` package is required.

## Privacy

- MIT open source
- No telemetry by default
- Never uploads source code
- OSV queries send package name/version only
- Runs on the local machine / CI runner

## Example output

```text
AgentProof
──────────────────────────────────

Detected: NestJS + TypeScript + pnpm

Change Risk               HIGH
Production Readiness      81/100

✓ Typecheck               Passed
✓ Build                   Passed
✓ Tests                   Passed
✓ Lint                    Passed

⚠ New dependency          1
✗ Authorization removed   1

MERGE STATUS

BLOCKED
```

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system design
- [RULES.md](./RULES.md) — rule catalog
- [SECURITY.md](./SECURITY.md) — security policy
- [CONTRIBUTING.md](./CONTRIBUTING.md) — how to contribute
- [CHANGELOG.md](./CHANGELOG.md) — release notes
- [ROADMAP.md](./ROADMAP.md) — product roadmap

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT
