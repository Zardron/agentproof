# Changelog

## 0.2.0

### Added

- Framework adapters for Fastify, Hono, Remix, Astro, Nuxt, Vue, SvelteKit, and Angular
- Optional local HTML report via `--html` / `--html path/to/report.html`
- TypeScript config loading for `agentproof.config.ts` (via jiti)
- Monorepo-aware check targeting for changed workspace packages
- OSV advisory enrichment for new/upgraded dependencies (`dependencies.advisories`)
- Version read from `package.json`; CI requires a version bump on every PR

## 0.1.0

### Added

- Initial AgentProof CLI (`npx agentproof`)
- Project detection for Node/TS, Express, NestJS, Vite/React, Next.js
- Diff analysis (`--staged`, `--base`, revision args)
- Checks: typecheck, lint, tests, build, dependency changes
- Security and secret rules with evidence
- Auth / authz regression detection vs base branch
- Policy config (`agentproof.config.yaml` / `.json`)
- Terminal, JSON, and SARIF reporters
- GitHub Action and annotations in `--ci`
