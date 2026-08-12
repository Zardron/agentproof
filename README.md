# AgentProof

**Verify code changes before they reach production.**

AgentProof is a framework-aware, CI-friendly verification tool. It evaluates a git diff objectively — typecheck, build, tests, secrets, dependency risk, and security regressions — then reports whether the change is safe to merge.

## Quick start

```bash
npx agentproof
npx agentproof --base main --ci
npx agentproof --staged
npx agentproof --json
npx agentproof --sarif
```

## Why teams use it

| Audience | Use case |
|----------|----------|
| Individual developers | Catch secrets, auth regressions, and broken builds before opening a PR |
| Startups / agencies | Enforce a shared merge bar in CI |
| Platform / security teams | Policy as code: protected paths, required checks, fail-on thresholds |
| Engineering orgs | Deterministic CI gate for pull requests |

## Supported ecosystem (Phase 1)

- **Runtime:** Node.js · TypeScript · JavaScript
- **Package managers:** npm · pnpm · Yarn · Bun
- **Frameworks (first-class):** plain Node · Express · NestJS · React/Vite · Next.js

Detection is automatic. No framework flag required for normal use.

## Example output

```text
AgentProof
──────────────────────────────────

Detected: NestJS + TypeScript + pnpm

Change Risk               HIGH
Production Readiness      81/100

✓ Typecheck               Passed
✓ Build                   Passed
✓ Tests                   184/184
✓ Lint                    Passed

⚠ New dependency          1
⚠ Auth-sensitive files    2
✗ Authorization removed   1
✗ Possible secret         1

MERGE STATUS

BLOCKED
```

## Configuration

`agentproof.config.yaml` (or `.ts` / `.json`):

```yaml
fail_on: high

protected_areas:
  - "src/auth/**"
  - "src/payments/**"
  - "prisma/migrations/**"

require:
  build: true
  tests: true
  typecheck: true

dependencies:
  new_dependency: review

security:
  secret_detection: true
  auth_regression: true
```

## GitHub Actions

```yaml
- uses: agentproof/agentproof@v1
  with:
    base: main
    fail-on: high
```

## Privacy model

- Public and open source (MIT)
- No telemetry by default
- Never uploads source code
- Runs entirely on the local machine / CI runner
- Deterministic core analysis

## Rule methodology

Rules prefer **confirmed** and **high-confidence** findings with evidence (base vs current snippets). Ambiguous cases are labeled `needs_review` instead of blocking by default. See [RULES.md](./RULES.md).

Flagship differentiator: **security regression detection** — authorization or authentication enforcement present on the base branch that was removed in the current change.

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system design
- [TASKS.md](./TASKS.md) — roadmap of work
- [RULES.md](./RULES.md) — rule catalog
- [SECURITY.md](./SECURITY.md) — security policy
- [CONTRIBUTING.md](./CONTRIBUTING.md) — how to contribute
- [ROADMAP.md](./ROADMAP.md) — product roadmap

## License

MIT
