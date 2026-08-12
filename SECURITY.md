# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.3.x   | ✅ |
| < 0.3   | Best-effort |

## Reporting a vulnerability

Please report security issues in **AgentProof itself** through [GitHub Security Advisories](https://github.com/Zardron/agentproof/security/advisories/new).

Do **not** open a public issue for undisclosed vulnerabilities.

## Product security guarantees

- AgentProof does **not** upload repository source code
- No telemetry is sent by default
- OSV advisory lookups send package **name/version only**
- Findings should be treated carefully in CI logs (prefer SARIF/JSON where appropriate)

## Scope

This policy covers:

- the `agentproof` CLI (`agentproof-cli` on npm)
- the GitHub Action in this repository
- published package artifacts

Application code analyzed by AgentProof remains the consumer’s responsibility.
