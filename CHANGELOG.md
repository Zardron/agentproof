# Changelog

## 0.1.0

### Added

- Initial AgentProof CLI (`npx agentproof`)
- Project detection for Node/TS, Express, NestJS, Vite/React, Next.js
- Diff analysis (`--staged`, `--base`, revision args)
- Checks: typecheck, lint, tests, build, dependency changes
- Security and secret rules with evidence
- Auth / authz regression detection vs base branch
- Policy config (`agentproof.config.yaml` / `.ts`)
- Terminal, JSON, and SARIF reporters
- GitHub Action and annotations in `--ci`
