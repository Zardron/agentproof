# Architecture

AgentProof verifies a **code change** against project context and policy.

## Principles

- Deterministic core analysis
- Privacy-first: local-only; no telemetry by default
- Framework-agnostic core with pluggable adapters
- Evidence for every finding; low false-positive bias
- CI-safe exit codes and SARIF / annotations

## Pipeline

```text
CLI args
  → load policy
  → detect project (runtime, language, PM, framework, tools)
  → compute git diff (staged | --base | revision)
  → classify risk domains
  → run checks (typecheck, lint, tests, build, dependencies)
  → run rules (secrets, security, auth regression)
  → score + apply policy thresholds
  → report (terminal | JSON | SARIF | HTML | GitHub annotations)
  → exit code
```

Advisories (`dep.advisory`) enrich dependency findings via OSV after dependency analysis. Monorepo runs resolve per-package scripts with workspace filters.

## Normalized models

### ProjectModel

Captured once per run: root, language, package manager, frameworks[], build/test/lint commands, ORM, monorepo shape, CI provider, public env prefixes (`NEXT_PUBLIC_`, `VITE_`, `NUXT_PUBLIC_`).

### NormalizedDiff

Per-file status (A/M/D/R), hunks with base/current lines, language, and risk domains.

### Finding

`ruleId`, severity (`critical|high|medium|low|info`), confidence (`confirmed|high|needs_review`), message, file/line, evidence (base + current snippets), optional remediation.

## Modules

| Module | Responsibility |
|--------|----------------|
| `cli/` | Argument parsing and process entry |
| `detect/` | Project, package manager, framework adapters |
| `git/` | Diff engine + risk classification |
| `checks/` | Typecheck, lint, tests, build, dependency delta |
| `rules/` | Pluggable `Rule` interface + registry |
| `policy/` | Zod schema, cosmiconfig load, fail_on / protected paths |
| `core/` | Pipeline orchestration, scoring, exit codes |
| `reporters/` | Terminal, JSON, SARIF, GitHub annotations |
| `ci/` | CI environment detection |
| `adapters/` | Framework-specific command resolution |

## Rule interface

```ts
interface Rule {
  id: string
  title: string
  category: string
  severity: Severity
  confidence: Confidence
  supports(context: ProjectContext): boolean
  run(context: RuleContext): Promise<Finding[]>
}
```

## Policy engine

Defaults: `fail_on: high`, typecheck required, build/tests/lint optional, secret + auth regression enabled.

- Findings at or above `fail_on` → `BLOCKED`
- `needs_review` / warn-level dependency policy → `REVIEW` when not blocking
- Protected path matches escalate severity one level
- `ignore_rules` and `severity_overrides` applied before thresholding

## Scoring

**Change Risk:** `LOW | MEDIUM | HIGH | CRITICAL` from highest risk domain + finding severities.

**Production Readiness (0–100):** starts at 100; subtracts weighted penalties for failed required checks and findings by severity/confidence. Confirmed critical findings dominate.

## Security regression (flagship)

Compare base vs current for auth middleware/guards and authorization helpers (`requireRole`, `can`, `assertPermission`, Nest `@UseGuards`, Express `authenticate`, etc.). Removal without relocation → high/critical with evidence snippets and merge block under default policy.

## False-positive controls

- Secret allowlists: `.env.example`, placeholders (`YOUR_`, `EXAMPLE`, `xxx`)
- Skip test/fixture paths for `eval` and similar
- Lockfile-only dependency churn → info unless `package.json` changed
- Auth relocation across renames → downgrade or clear

## Extension points

1. Register a framework adapter under `detect/frameworks/`
2. Add a `Rule` to `rules/registry.ts`
3. Map commands in `adapters/` for build/test/lint resolution
