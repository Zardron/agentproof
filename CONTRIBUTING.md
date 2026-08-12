# Contributing

Thanks for helping improve AgentProof.

## Setup

```bash
pnpm install
pnpm build
pnpm test
```

Requires Node.js 20+.

## Guidelines

- Prefer high-confidence rules with evidence over broad pattern spam.
- Add fixtures under `fixtures/` and `tests/fixtures/` for new rules (clean + vulnerable + false-positive).
- Keep the core free of network calls that upload source.
- Match existing TypeScript style; run `pnpm typecheck` and `pnpm test` before opening a PR.
- Config formats that work today: `agentproof.config.yaml`, `.yml`, `.json`, and `package.json#agentproof`. TypeScript config files are reserved for a later loader.

## Pull requests

1. Describe the why (false-positive fix, new adapter, CI behavior).
2. Include tests.
3. Update `RULES.md` / `CHANGELOG.md` when user-visible.

## Code of conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
