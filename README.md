# AgentProof

[![CI](https://github.com/Zardron/agentproof/actions/workflows/ci.yml/badge.svg)](https://github.com/Zardron/agentproof/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/agentproof-cli.svg)](https://www.npmjs.com/package/agentproof-cli)
[![Node.js](https://img.shields.io/node/v/agentproof-cli.svg)](https://www.npmjs.com/package/agentproof-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Verify code changes before they reach production.

> AgentProof reviews the changes in your Git repository before they reach production. It detects your project tooling, runs available checks (typecheck, lint, tests, build), analyzes dependency and security risks, evaluates the changed code against policy, and reports a **PASS**, **REVIEW**, or **BLOCKED** merge status.

Install the npm package [`agentproof-cli`](https://www.npmjs.com/package/agentproof-cli). After installation, run the CLI binary named **`agentproof`**.

> **Warning:** The npm package named `agentproof` is a different product. Install **`agentproof-cli`**, then run **`npx agentproof`**.

---

## Quick Start

### 1. Install

```bash
npm install -D agentproof-cli
```

```bash
pnpm add -D agentproof-cli
```

```bash
yarn add -D agentproof-cli
```

```bash
bun add -D agentproof-cli
```

`npm install -D agentproof-cli` adds the **agentproof-cli** package to your project. After that, `npx agentproof` runs the locally installed **agentproof** binary (not the unrelated npm package named `agentproof`).

### 2. Check your current branch against main

```bash
npx agentproof --base main
```

`--base main` compares the changes on your current branch against the `main` branch (merge-base diff, plus local staged/unstaged work). This is the recommended command when working on a feature branch.

### 3. Understand the result

```text
AgentProof 0.x.x
──────────────────────────────────

Detected Project
──────────────────────────
Runtime           Node.js
Language          TypeScript
Framework         nextjs + react
Package Manager   npm
Tests             vitest
Linter            eslint
ORM               none
Monorepo          none

Detected: nextjs + react + TypeScript + npm

Change Risk               HIGH
Production Readiness      73/100

✓ Typecheck               Passed
✗ Lint                    Failed
· Tests                   Skipped (not configured)
✓ Build                   Passed

⚠ New dependency          1

MERGE STATUS

REVIEW
```

| Status | Meaning |
|--------|---------|
| **PASS** | Safe according to configured checks and policy |
| **REVIEW** | Potential issues should be reviewed before merging |
| **BLOCKED** | Merge should be blocked according to policy (for example a required check failed, or a finding at/above `fail_on`) |

**Change Risk** and **Production Readiness** are scores for the report. They do not by themselves set PASS / REVIEW / BLOCKED — merge status comes from policy, required checks, and findings.

Exit codes: `0` for PASS/REVIEW (and for BLOCKED without `--ci`) · `1` for BLOCKED when `--ci` is set · `2` for unexpected errors

While AgentProof runs, the terminal shows the current stage so it does not look frozen:

```text
AgentProof 0.x.x
────────────────────────────

✓ Detected nextjs + react + TypeScript + npm
✓ Compared current branch against main
  24 changed files
✓ Typecheck passed (3.2s)
✗ Lint failed (1.8s)
· Tests not configured
✓ Build passed (12.4s)
✓ Dependencies passed
✓ Security analysis complete
✓ Risk analysis complete
```

Then the full report is printed. In CI or non-TTY terminals, the same stages are logged as stable `[AgentProof]` lines. `--json` and `--sarif` keep stdout machine-readable; progress goes to stderr.

---

## Which command should I use?

| What you want to do | Command |
|---------------------|---------|
| Compare current branch against main | `npx agentproof --base main` |
| Check staged changes before committing | `npx agentproof --staged` |
| Check uncommitted work vs `HEAD` (default) | `npx agentproof` |
| Check the previous commit | `npx agentproof HEAD~1` |
| Run in CI | `npx agentproof --base origin/main --ci` |
| Generate an HTML report | `npx agentproof --base main --html agentproof-report.html` |
| Generate JSON | `npx agentproof --base main --json` |
| Generate SARIF | `npx agentproof --base main --sarif` |
| Run rules without typecheck/lint/test/build/dependency checks | `npx agentproof --base main --skip-checks` |
| Show extra progress detail (commands, config) | `npx agentproof --base main --verbose` |
| See all options | `npx agentproof --help` |

---

## Understanding PASS / REVIEW / BLOCKED

AgentProof scores findings and check results against your policy (`fail_on`, required checks, dependency rules, and security settings).

- **PASS** — no findings or failed required checks that warrant review or blocking
- **REVIEW** — medium-severity or `needs_review` findings, or dependency changes that policy marks for review/warn (and nothing that blocks)
- **BLOCKED** — a required check failed, a finding meets or exceeds `fail_on`, or dependency policy is set to `block`

With `--ci`, a **BLOCKED** result exits with code `1` so CI jobs fail. Without `--ci`, BLOCKED is still printed but the process exits `0`.

On GitHub Actions, findings are also emitted as pull-request annotations (errors/warnings/notices). `--ci` alone does not print annotations outside GitHub Actions.

---

## Recommended Local Workflow

### Feature branch

```bash
git checkout -b my-feature

# make code changes

npx agentproof --base main
```

This reviews your feature-branch changes relative to `main`.

### Before committing

```bash
git add .

npx agentproof --staged

git commit -m "Add feature"
```

`--staged` analyzes only files currently staged with Git.

---

## What AgentProof Checks

AgentProof detects project tooling where supported, then runs available checks and security rules against the diff.

### Project checks (when detected)

| Check | Behavior |
|-------|----------|
| **Typecheck** | Runs the project's typecheck / `tsc` when TypeScript is present |
| **Lint** | Runs the detected linter (often ESLint); can fail only on issues introduced on changed lines (`lint.new_issues_only`) |
| **Tests** | Runs the detected test script/runner when configured |
| **Build** | Runs the detected build command when configured |
| **Dependencies** | Reviews dependency deltas (new packages, major bumps, risky install sources) |

If a check has no detected command and is not required by policy, it is reported as **Skipped**. If a check is required by policy but no command is detected, it **fails**.

`--skip-checks` skips typecheck, lint, tests, build, and the dependency check. Security rules still run. OSV advisories still run when enabled and there are new/upgraded packages.

### Security and policy analysis

- Secret / hardcoded credential detection
- Authentication and authorization regressions vs the base branch
- Unsafe patterns (eval, shell exec, SQL concatenation, open redirects, path traversal, weak CORS/TLS/headers, sensitive logging, and related rules)
- Optional OSV advisories for new or upgraded packages (package name/version only)

Full rule catalog: [RULES.md](./RULES.md).

### Pipeline overview

1. Detect project tooling (package manager, frameworks, build/test/lint)
2. Build the git diff (`--staged`, `--base`, or a revision)
3. Classify changed files by risk domain
4. Run available checks (unless `--skip-checks`)
5. Evaluate security rules with evidence snippets
6. Score change risk and production readiness
7. Emit `PASS` / `REVIEW` / `BLOCKED`

---

## Example

In the sample output above:

- TypeScript typecheck passed
- Build passed
- Lint failed and needs attention
- Tests were skipped because no test setup/script was detected
- A new dependency was flagged for review
- **Change Risk** is HIGH (sensitive paths and/or findings), and **Production Readiness** is 73/100
- AgentProof recommends **REVIEW** before merging — not PASS, and not BLOCKED unless policy requires it

---

## Common Workflows

### Feature branch

```bash
npx agentproof --base main
```

Use while developing on a branch that will merge into `main`.

### Before committing

```bash
npx agentproof --staged
```

Use as a quick gate on only what you are about to commit.

### Last commit

```bash
npx agentproof HEAD~1
```

Compares `HEAD~1..HEAD` — useful for reviewing the most recent commit.

### HTML report

```bash
npx agentproof --base main --html agentproof-report.html
```

Writes a local HTML report you can open in a browser. Omitting the path defaults to `agentproof-report.html`. HTML is written in addition to stdout (terminal, JSON, or SARIF). Progress confirms: `HTML report written to agentproof-report.html`.

### CI

```bash
npx agentproof --base origin/main --ci
```

Use `origin/main` (or your repo's default remote base) in CI, and `--ci` so **BLOCKED** fails the job.

---

## CLI Reference

```bash
npx agentproof --help
```

| Flag / argument | Purpose | Example |
|-----------------|---------|---------|
| `[revision]` | Compare that revision to `HEAD` (e.g. previous commit) | `npx agentproof HEAD~1` |
| `--base <ref>` | Compare against a branch or commit (recommended for feature branches) | `npx agentproof --base main` |
| `--staged` | Analyze staged changes only | `npx agentproof --staged` |
| `--ci` | CI mode: exit `1` when status is BLOCKED | `npx agentproof --base origin/main --ci` |
| `--json` | Emit JSON report to stdout | `npx agentproof --base main --json` |
| `--sarif` | Emit SARIF report to stdout | `npx agentproof --base main --sarif` |
| `--html [path]` | Write a local HTML report (default path: `agentproof-report.html`) | `npx agentproof --base main --html report.html` |
| `--config <path>` | Use a specific policy config file | `npx agentproof --config agentproof.config.yaml` |
| `--cwd <path>` | Run against a different working directory | `npx agentproof --cwd ./packages/api --base main` |
| `--skip-checks` | Skip typecheck/lint/test/build/dependency checks; run rules (and advisories) only | `npx agentproof --base main --skip-checks` |
| `--verbose` | Show resolved check commands and extra progress detail | `npx agentproof --base main --verbose` |
| `--version` | Print CLI version | `npx agentproof --version` |

Default with no flags: analyze staged + unstaged changes vs `HEAD`. If the working tree is clean, AgentProof falls back to the last commit (`HEAD~1..HEAD`).

If both `--staged` and `--base` are passed, **`--staged` wins**. If both `--json` and `--sarif` are passed, **SARIF is printed** (JSON is not). `--html` always writes a file and does not replace stdout.

---

## Configuration

Config is optional. Without a file, built-in defaults apply (typecheck required, `fail_on: high`, secret detection and auth regression enabled, advisories on).

### Minimal example

```yaml
# agentproof.config.yaml
extends: ci
fail_on: high
```

### Supported formats

AgentProof loads (via cosmiconfig), in order of discovery:

- `agentproof.config.yaml` / `.yml` / `.json` / `.ts` / `.js` / `.mjs`
- `.agentproofrc` / `.agentproofrc.yaml` / `.yml` / `.json`
- `package.json` → `"agentproof": { ... }`

Or pass an explicit path:

```bash
npx agentproof --config ./policies/team.yaml --base main
```

### Full configuration example

```yaml
extends: security   # strict | security | relaxed | ci | ./team-pack.yaml

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
  new_issues_only: true

dependencies:
  new_dependency: review   # allow | warn | review | block
  advisories: true

security:
  secret_detection: true
  auth_regression: true

ignore_rules:
  - sec.dangerously_set_html

severity_overrides:
  dep.new_package: low
```

### Policy packs

| Pack | Intent |
|------|--------|
| `ci` | Typical PR gate (typecheck required) |
| `security` | Secrets + auth regression focus; new deps → review |
| `strict` | Require build, tests, typecheck, and lint |
| `relaxed` | Block only on critical findings |

`protected_areas` escalate finding severity for matched paths. `require.*` makes a failed (or missing) check block the merge when that check is required.

---

## GitHub Actions

Checkout needs full git history so `--base` can resolve the target branch.

### 1. Official Action

```yaml
name: AgentProof

on:
  pull_request:

jobs:
  agentproof:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: Zardron/agentproof@v0.4.0
        with:
          base: origin/main
          fail-on: high
```

The Action installs `agentproof-cli`, always runs with `--ci`, and emits GitHub annotations for findings. Pin the Action tag to a [release](https://github.com/Zardron/agentproof/releases) that matches the CLI version you want.

Optional inputs (from `action.yml`):

| Input | Default | Description |
|-------|---------|-------------|
| `base` | `origin/main` | Git ref to compare against |
| `fail-on` | `high` | Minimum severity that blocks (`low` \| `medium` \| `high` \| `critical` \| `none`) |
| `config` | _(empty)_ | Optional path to an AgentProof config; Action still overlays `fail-on` |
| `working-directory` | `.` | Subdirectory to analyze |
| `skip-checks` | `false` | Skip typecheck/lint/test/build and the dependency check |
| `version` | _(from Action package.json)_ | Pin `agentproof-cli` version from npm |

Without `config`, the Action generates a CI policy that extends the `ci` pack (typecheck required, secret detection and auth regression on). With `config`, that file is extended and `fail-on` is still applied.

### 2. Install the CLI manually

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- run: npm install -D agentproof-cli
- run: npx agentproof --base origin/main --ci
```

---

## Troubleshooting

### AgentProof seems stuck

Project checks (typecheck, lint, tests, build) can take a while on large repos. The CLI shows the current stage while it runs. To see whether a project check is the slow step:

```bash
npx agentproof --base main --skip-checks
```

That skips typecheck, lint, tests, build, and the dependency check. Security rules (and OSV advisories, if enabled) still run.

### Advisory lookup failed / offline

If OSV cannot be reached, AgentProof records a `needs_review` advisory warning instead of failing open. For a fully offline run:

```yaml
dependencies:
  advisories: false
```

### Lint failed

AgentProof runs your project's detected lint command. Inspect and fix using the same tool your repo already uses — often:

```bash
npm run lint
```

(or `pnpm lint` / `yarn lint` / `bun run lint`, depending on your package manager).

### Tests skipped

AgentProof reports tests as **Skipped** when no test script/runner is detected (summary: `Skipped (not configured)`). Add a detectable test setup, or set `require.tests: true` only when you intentionally want a missing test command to fail the gate.

### Wrong base branch

If your default branch is not `main`:

```bash
npx agentproof --base develop
```

```bash
npx agentproof --base master
```

In CI, prefer the remote-tracking ref (for example `origin/main`). The base should match the branch you merge into.

### Shallow clone / unknown base

`--base origin/main` needs that ref locally. In GitHub Actions, use `actions/checkout` with `fetch-depth: 0`. A shallow clone is a common reason the base branch cannot be resolved.

### `--staged` ignored `--base`

If both flags are passed, AgentProof analyzes the index only (`git diff --cached`). Drop `--staged` when you want a branch comparison.

---

## Framework and package-manager support

Works on any Node.js / JavaScript / TypeScript git repository. Built-in detection for:

- **Backend:** Express, Fastify, Hono, NestJS, plain Node
- **Apps:** React, Vite, Next.js, Remix, Astro, Nuxt, Vue, SvelteKit, Angular

Unsupported frameworks still get checks and rules; they skip framework-specific detection helpers.

**Package managers:** npm, pnpm, Yarn, Bun.

**Linters detected:** ESLint, Biome (or a `lint` script).

**ORMs detected:** Prisma, Drizzle, TypeORM.

**Monorepos:** npm/pnpm/Yarn/Bun workspaces, plus Nx/Turbo layout discovery. In a workspace, checks target the packages touched by the diff when possible.

---

## Programmatic API (advanced)

```js
import { runPipeline, getVersion } from 'agentproof-cli'

const { report, exitCode, output } = await runPipeline({
  cwd: process.cwd(),
  base: 'main',
  staged: false,
  json: true,
  sarif: false,
  html: 'agentproof-report.html',
  ci: true,
  skipChecks: false,
})

console.log(getVersion(), report.mergeStatus)
process.exitCode = exitCode
```

`runPipeline` returns `{ report, exitCode, output }`. Optional fields include `revision`, `configPath`, `verbose`, and `onProgress` (progress events; no terminal output unless you handle them). TypeScript declarations are included. Prefer the `agentproof` CLI for most workflows.

---

## Privacy

- MIT licensed
- No telemetry by default
- Source code is not uploaded
- When dependency advisories are enabled, OSV queries send **package name and version only** for new/upgraded packages
- Runs on your machine or CI runner

Disable advisories with `dependencies.advisories: false` if you want fully offline runs.

---

## Requirements

- **Node.js** 20+
- A **Git** repository (non-git directories produce an empty diff and still emit a report)
- **Network** only when dependency advisories are enabled and there are new/upgraded packages to query

---

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [RULES.md](./RULES.md)
- [SECURITY.md](./SECURITY.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [CHANGELOG.md](./CHANGELOG.md)
- [ROADMAP.md](./ROADMAP.md)

## Maintainer

Maintained by [Zardron Pesquera](https://github.com/Zardron).

## License

[MIT](./LICENSE)
