# Tasks

Tracked work for AgentProof.

## Phase 1

- [x] Scaffold package (`agentproof`), MIT, TypeScript ESM, tsup
- [x] Core docs: README, ARCHITECTURE, TASKS, RULES, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, CHANGELOG, ROADMAP, LICENSE
- [x] Normalized `ProjectModel` / Diff / Finding types
- [x] CLI: default, `--staged`, `--base`, revision, `--json`, `--sarif`, `--ci`, `--config`, `--help`
- [x] Project + package manager + framework detection (Node, Express, NestJS, Vite/React, Next.js)
- [x] Git diff engine + risk domain classifier
- [x] Checks: typecheck, lint, tests, build, dependencies
- [x] Policy engine (`fail_on`, protected areas, require.*, dependency policy)
- [x] 12 high-value rules (secrets, security, auth regression, deps, untested sensitive)
- [x] Scoring + merge status
- [x] Reporters: terminal, JSON, SARIF, GitHub annotations
- [x] GitHub Action (`action.yml`)
- [x] Unit + integration tests and fixtures (clean / vulnerable / false-positive)

## Phase 2 (current)

- [x] Monorepo package targeting for changed workspaces
- [x] HTML report (`--html`)
- [x] Broader framework adapters (Fastify, Hono, Remix, Astro, Nuxt, SvelteKit, Angular, Vue)
- [x] OSV advisory enrichment for dependency findings
- [x] TypeScript config loading (`agentproof.config.ts`)
- [x] Version bump required on every PR
- [ ] Diff-aware lint “new issues only” via baseline
- [ ] Team policy packs (shareable YAML)

## Phase 3

- [ ] SARIF upload helpers for code scanning
- [ ] IDE / pre-commit thin wrappers
- [ ] Performance budgets on large repos
- [ ] Optional opt-in anonymous usage metrics (off by default)

## Never

- Uploading source without explicit opt-in
- Shipping hundreds of low-signal rules
