# Contributing

Thanks for helping improve AgentProof.

## Setup

```bash
npm install
npm run build
npm test
```

Requires Node.js 20+.

Published package name: **`agentproof-cli`** (CLI binary: `agentproof`).

## Guidelines

- Prefer high-confidence rules with evidence over broad pattern spam.
- Add fixtures under `fixtures/` for new rules (clean + vulnerable + false-positive).
- Keep the core free of network calls that upload source. OSV queries send package name/version only.
- Match existing TypeScript style; run `npm run typecheck` and `npm test` before opening a PR.
- Config formats: `agentproof.config.yaml`, `.yml`, `.json`, `.ts`, and `package.json#agentproof`.

## Pull requests

1. Describe the why (false-positive fix, new adapter, CI behavior).
2. Include tests.
3. Update `RULES.md` / `CHANGELOG.md` when user-visible.
4. **Bump the version** in `package.json` on every PR (`patch` for fixes, `minor` for features) and add a `CHANGELOG.md` entry. CI fails if the version is not greater than the base branch.

## Publishing

Merges to `main` that introduce a version not yet on npm are published automatically by [`.github/workflows/publish.yml`](./.github/workflows/publish.yml):

1. `npm publish` of **`agentproof-cli`** (public, with provenance)
2. Git tag `v<version>`
3. GitHub Release

Configure one of:

- **npm trusted publishing** for this GitHub repo / `publish.yml` workflow (preferred; uses OIDC, no long-lived token)
- Repository secret **`NPM_TOKEN`** (classic automation token with publish rights)

Do not publish from pull requests. The workflow only runs on `main`.

## Code of conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
