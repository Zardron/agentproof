# AgentProof

[![CI](https://github.com/Zardron/agentproof/actions/workflows/ci.yml/badge.svg)](https://github.com/Zardron/agentproof/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/agentproof-cli.svg)](https://www.npmjs.com/package/agentproof-cli)
[![Node.js](https://img.shields.io/node/v/agentproof-cli.svg)](https://www.npmjs.com/package/agentproof-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**Verify code changes before they reach production.**

AgentProof is a local-first verification CLI for **Node.js / JavaScript / TypeScript** repositories. It reviews a git diff against project context and policy, then reports whether the change is safe to merge.

Install from npm as [`agentproof-cli`](https://www.npmjs.com/package/agentproof-cli). The binary name is `agentproof`.

---

## Why this exists

Pull requests fail for boring, expensive reasons: broken typechecks, missing tests on sensitive paths, leaked secrets, dependency surprises, and accidental auth regressions.

AgentProof packages those checks into one CI-friendly command with evidence-backed findings and an explicit merge status.

---

## Pipeline

1. Detect project tooling (package manager, frameworks, build/test/lint)
2. Build the git diff (`--staged`, `--base`, or a revision)
3. Classify changed files by risk domain
4. Run available checks (typecheck, lint, tests, build, dependency review)
5. Evaluate security rules with evidence snippets
6. Score change risk and production readiness
7. Emit `PASS` / `REVIEW` / `BLOCKED`

---

## Quick start

```bash
npm install -D agentproof-cli
```

```bash
npx agentproof-cli
npx agentproof-cli --base main --ci
```

```bash
pnpm add -D agentproof-cli
yarn add -D agentproof-cli
```

> Note: the npm package `agentproof` is a different product. This project publishes **`agentproof-cli`**.

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

## CLI

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
| `--base <ref>` | Compare against a branch or commit |
| `--staged` | Analyze staged changes only |
| `--ci` | Exit `1` when blocked |
| `--json` / `--sarif` / `--html` | Alternate report formats |
| `--config <path>` | Policy file |
| `--skip-checks` | Run rules without project checks |

Exit codes: `0` pass/review · `1` blocked (with `--ci`) · `2` error

---

## Coverage

### Checks
- Typecheck, lint, tests, build (when detected and required)
- Lint can fail only on issues introduced on changed lines
- Dependency deltas + optional OSV advisories (package name/version only)

### Rules
High-signal findings with evidence: secrets, unsafe eval/shell/SQL patterns, redirect and path risks, CORS/TLS/header issues, sensitive logging, and auth/authz removals versus the base branch.

See [RULES.md](./RULES.md).

### Framework detection
Works on any Node/JS/TS git repo. Built-in detection for:

- Backend: Express, Fastify, Hono, NestJS, plain Node
- Apps: React, Vite, Next.js, Remix, Astro, Nuxt, Vue, SvelteKit, Angular

Unsupported frameworks still get checks and rules; they just skip framework-specific detection helpers.

Package managers: npm, pnpm, Yarn, Bun.

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
| `security` | Secrets + auth regression focus |
| `strict` | Require build/tests/typecheck/lint |
| `relaxed` | Block only on critical findings |

---

## GitHub Action

```yaml
- uses: Zardron/agentproof@v0.3.2
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

TypeScript declarations are included.

---

## Privacy

- MIT licensed
- No telemetry by default
- Source is not uploaded
- OSV queries send package name/version only
- Runs on your machine or CI runner

---

## Requirements

- Node.js 20+
- Git repository
- Network only if advisories are enabled

---

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [RULES.md](./RULES.md)
- [SECURITY.md](./SECURITY.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CHANGELOG.md](./CHANGELOG.md)
- [ROADMAP.md](./ROADMAP.md)

## Maintainer

Maintained by [Zardron Pesquera](https://github.com/Zardron).

## License

[MIT](./LICENSE)
