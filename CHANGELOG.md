# Changelog

## Unreleased

### Changed

- CLI progress labels now match the real pipeline stages (`Project detected`, `Git changes detected`, dependency analysis, security checks, production readiness)
- Default progress hides fast config/report stages unless `--verbose`; failures still surface
- Skipped checks use `-` in the live progress stream
- Ctrl+C restores the cursor after an in-flight spinner
- Elapsed time is shown for detect, diff, security, and readiness stages (not only typecheck/lint/tests/build)

## 0.4.1

### Added

- GitHub Actions workflow to publish `agentproof-cli` to npm, create `v*` tags, and open a GitHub Release when `main` gets a new version

## 0.4.0

### Added

- Live CLI progress for each pipeline stage (config, detect, diff, checks, security, risk, report)
- Interactive spinner on TTY; stable `[AgentProof]` lines in CI / non-TTY
- Progress is written to stderr so `--json` / `--sarif` stdout stays machine-readable
- `--verbose` shows resolved check commands and config detail
- Elapsed time on completed typecheck / lint / test / build stages

## 0.3.3

### Fixed

- `--ci` now gates exit code `1` on `BLOCKED` (local runs stay exit `0` and still report status)
- `dependencies.new_dependency: allow` no longer forces `REVIEW` / `BLOCKED` for `dep.new_package`
- OSV advisory network/HTTP failures emit a `needs_review` warning instead of failing open silently
- Build is no longer claimed via bare `tsc` when `scripts.build` is missing
- Monorepo kind labeling for npm/yarn/bun workspaces; Nx/Turbo fall back to `apps`/`packages`/`libs` layout discovery
- GitHub Action `fail-on` still applies when a custom `config` input is set (overlay extends)

## 0.3.2

### Changed

- Public docs tone: engineering-focused README, removed scaffold-style task checklist
- Replaced `TASKS.md` with a short `BACKLOG.md`

## 0.3.1

### Changed

- Public README polish (badges, clearer positioning, framework scope)
- GitHub issue/PR templates and security policy wording for `agentproof-cli`

## 0.3.0

### Added

- Diff-aware lint filtering (`lint.new_issues_only`, default `true`) — only issues on changed lines fail the lint check
- Shareable policy packs via `extends` (`strict`, `security`, `relaxed`, `ci`, or a local YAML/JSON path)
- Built-in pack files under `packs/`
- Public library entry for programmatic `runPipeline` usage
- GitHub Action prefers `npm install -g agentproof-cli@<version>` with source-build fallback

### Changed

- npm package name is **`agentproof-cli`** (the name `agentproof` on npm is a different package)
- Repository metadata points to `https://github.com/Zardron/agentproof`

## 0.2.1

### Fixed

- Monorepo checks now resolve per-package scripts via workspace filters (`pnpm --filter` / `npm -w` / `yarn workspace`)
- Dependency analysis reads the changed workspace `package.json` (not always the repo root)
- Framework `suggestBuild` is wired into project detection; adapters no longer claim a build when no script exists
- `--skip-checks` reports all check categories as skipped
- Security rules skip `scripts/` (CI helper tooling) to avoid dogfood false positives

### Added

- Security rules: `sec.open_redirect`, `sec.path_traversal`, `sec.unsafe_file_write`, `sec.headers_weakened`, `sec.sensitive_logging`

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
