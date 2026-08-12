# AgentProof Plugin SDK

Write deterministic custom rules and load them only through explicit configuration.

## Security model

- Plugins are **never** fetched from the network at runtime.
- Config may reference **local filesystem paths** or **already-installed package names**.
- Specifiers like `https://...`, `git+...`, or `data:` are rejected.
- Plugin `analyze()` functions should stay local and deterministic (no network I/O).

## Enable a plugin

```yaml
# agentproof.config.yaml
plugins:
  - ./rules/acme-rules.ts
  - "@acme/agentproof-rules"
```

```js
// agentproof.config.mjs
export default {
  plugins: ['./rules/acme-rules.ts'],
}
```

## Author a rule

```ts
import {
  definePlugin,
  defineRule,
  createFinding,
  addedLines,
} from 'agentproof-cli/plugin'

export default definePlugin({
  name: 'acme-rules',
  rules: [
    defineRule({
      id: 'acme.require-auth-api',
      title: 'API routes should check auth',
      severity: 'high',
      analyze(ctx) {
        const findings = []
        for (const file of ctx.diff.files) {
          if (!file.path.includes('/api/')) continue
          // deterministic checks against ctx.diff / ctx.project / ctx.dependencies
          void addedLines
          void createFinding
          void findings
        }
        return findings
      },
    }),
  ],
})
```

## Context available to `analyze`

| Field | Meaning |
|-------|---------|
| `cwd` | Project root for this run |
| `project` | Detected tooling / frameworks / package manager |
| `policy` | Resolved AgentProof policy |
| `diff` | Normalized changed files + hunks |
| `dependencies` | Added / major / risky dependency signals from the diff |

Helpers:

- `createFinding(...)` — build a standard Finding
- `addedLines(file)` / `removedLines(file)` — line iterators for a diff file

## Finding shape

Findings must use AgentProof fields (`ruleId`, `severity`, `confidence`, `message`, optional `file` / `line` / `evidence` / `remediation`). Prefer `createFinding` so IDs stay consistent with built-in rules.

## Example fixture

See [`fixtures/example-plugin/index.ts`](./fixtures/example-plugin/index.ts) (`example.no-console-log`).

## Semver notes

Import from `agentproof-cli/plugin` only. Do not depend on deep `agentproof-cli/dist/...` paths — those are not a stability guarantee.
