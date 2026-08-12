# AgentProof

[![CI](https://github.com/Zardron/agentproof/actions/workflows/ci.yml/badge.svg)](https://github.com/Zardron/agentproof/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/agentproof-cli.svg)](https://www.npmjs.com/package/agentproof-cli)
[![Node.js](https://img.shields.io/node/v/agentproof-cli.svg)](https://www.npmjs.com/package/agentproof-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**Verify code changes before they reach production.**

AgentProof is a CI-friendly verification CLI for **Node.js / JavaScript / TypeScript** projects.

It analyzes a **git diff** — not who wrote the code — and answers one question:

> Is this change safe enough to merge?

It does **not** try to detect AI-generated code. It evaluates the resulting change objectively: project checks, secrets, dependency risk, and high-confidence security regressions.

📦 **npm:** [`agentproof-cli`](https://www.npmjs.com/package/agentproof-cli) · **CLI command:** `agentproof`

---

## Why AgentProof?

Modern PRs move fast. AgentProof gives teams a **deterministic merge gate** that:

- Runs the checks you already care about (typecheck, lint, tests, build)
- Flags secrets and risky patterns with **evidence**
- Detects **auth / authorization regressions** vs the base branch
- Enforces policy as code (`fail_on`, protected paths, required checks)
- Stays **local-first** — no source upload, no telemetry by default

---

## What it does

On each run, AgentProof:

1. **Detects** your project (language, package manager, frameworks, build/test/lint)
2. **Computes** the git diff (`--staged`, `--base`, or a revision)
3. **Classifies** changed files by risk (auth, payments, deps, migrations, …)
4. **Runs checks** when available: typecheck, lint, tests, build, dependency review
5. **Applies security rules** with evidence snippets
6. **Scores** change risk + production readiness
7. **Reports** merge status: `PASS` · `REVIEW` · `BLOCKED`

---

## Quick start

```bash
npm install -D agentproof-cli
```

```bash
# Review local changes
npx agentproof-cli

# Gate a PR against main
npx agentproof-cli --base main --ci
```

Also works with `pnpm` / `yarn`:

```bash
pnpm add -D agentproof-cli
yarn add -D agentproof-cli
```

> The npm name `agentproof` is a **different, unrelated** package. Install **`agentproof-cli`**. After install, the binary is still `agentproof`.

---

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

---

## Common commands

```bash
agentproof --help
agentproof --base main --ci
agentproof --staged
agentproof HEAD~1
agentproof --json
agentproof --sarif
agentproof --html ./agentproof-report.html
agentproof --config agentproof.config.yaml
agentproof --skip-checks
```

| Flag | Purpose |
|------|---------|
| `--base <ref>` | Compare against a branch/commit |
| `--staged` | Only staged changes |
| `--ci` | Exit `1` when blocked |
| `--json` / `--sarif` / `--html` | Machine-readable or HTML report |
| `--config <path>` | Policy file |
| `--skip-checks` | Rules only (skip project checks) |

**Exit codes:** `0` pass/review · `1` blocked (with `--ci`) · `2` error

---

## What gets checked

### Project checks
- Typecheck, lint, tests, build (when detected / required)
- Lint defaults to **new issues only** (changed lines)
- Dependency changes + optional OSV advisories (package name/version only)

### Security rules (high signal)
Secrets, `eval`, shell/SQL risks, open redirects, path traversal, unsafe writes, CORS/TLS/header issues, sensitive logging, and **auth/authz removals vs base**.

Full catalog: [RULES.md](./RULES.md)

---

## Framework support

Works on **any Node/JS/TS git repo**. Dedicated detection for:

**Backend:** Express · Fastify · Hono · NestJS · plain Node  
**Apps:** React · Vite · Next.js · Remix · Astro · Nuxt · Vue · SvelteKit · Angular

Other stacks still get checks + rules — just without framework-specific detection extras.

**Package managers:** npm · pnpm · Yarn · Bun

---

## Configuration

`agentproof.config.yaml` (also `.yml`, `.json`, `.ts`, or `package.json#agentproof`):

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
  new_dependency: review
  advisories: true

security:
  secret_detection: true
  auth_regression: true
```

| Pack | Intent |
|------|--------|
| `ci` | Typical PR gate |
| `security` | Secrets + auth regression |
| `strict` | Require build/tests/typecheck/lint |
| `relaxed` | Block only on critical findings |

---

## GitHub Action

```yaml
- uses: Zardron/agentproof@v0.3.1
  with:
    base: origin/main
    fail-on: high
```

Or:

```yaml
- run: npm install -D agentproof-cli
- run: npx agentproof --base origin/main --ci
```

---

## Programmatic API

```js
import { runPipeline, getVersion } from 'agentproof-cli'

const { report, exitCode } = await runPipeline({
  cwd: process.cwd(),
  base: 'main',
  staged: false,
  json: true,
  sarif: false,
  ci: true,
  skipChecks: false,
})

console.log(getVersion(), report.mergeStatus)
process.exitCode = exitCode
```

TypeScript types are included. No `@types` package needed.

---

## Privacy & trust

- MIT open source
- No telemetry by default
- Never uploads source
- OSV sends package name/version only
- Runs on your machine / CI runner

---

## Requirements

- Node.js **20+**
- A **git** repository
- Optional network for OSV advisories

---

## Documentation

| Doc | Contents |
|-----|----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Pipeline design |
| [RULES.md](./RULES.md) | Rule catalog |
| [SECURITY.md](./SECURITY.md) | Vulnerability reporting |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | How to contribute |
| [CHANGELOG.md](./CHANGELOG.md) | Release notes |
| [ROADMAP.md](./ROADMAP.md) | What’s next |

## Contributing

PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). Please follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

[MIT](./LICENSE) © Zardron Pesquera
