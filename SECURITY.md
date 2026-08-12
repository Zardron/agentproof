# Security Policy

## Reporting a vulnerability

Email security findings related to AgentProof itself to the maintainers via the GitHub Security Advisories flow on the repository. Do not open a public issue for undisclosed vulnerabilities.

## Product security guarantees

- AgentProof does **not** upload repository source code.
- No telemetry is sent by default.
- Secrets discovered in diffs are printed only as redacted evidence in reports; prefer SARIF/JSON in CI log hygiene reviews.
- The GitHub Action must not echo secret values into annotations beyond redacted snippets.

## Scope

This policy covers the `agentproof` CLI, GitHub Action, and published packages. Customer application code analyzed by AgentProof remains the customer's responsibility.
