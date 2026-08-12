# Rules

AgentProof ships high-value rules with confidence levels: `confirmed` · `high` · `needs_review`.

## Catalog

| ID | Title | Default severity | Confidence |
|----|--------|------------------|------------|
| `secret.hardcoded` | Hardcoded secrets / committed `.env` content | critical | high / needs_review |
| `secret.client_env` | Secret-like values in public env prefixes | high | high |
| `sec.eval` | Introduced `eval` / `new Function` | high | confirmed |
| `sec.child_process` | Shell exec with non-literal args | high | high / needs_review |
| `sec.sql_concat` | String-concat / unsafe template SQL | high | high |
| `sec.tls_insecure` | TLS verification disabled | critical | confirmed |
| `sec.cors_star` | CORS `origin: '*'` with credentials | high | high |
| `sec.dangerously_set_html` | New unsafe HTML injection sinks | medium | needs_review |
| `sec.open_redirect` | Redirect destination from request input | high | high |
| `sec.path_traversal` | Filesystem path from request input | high | high |
| `sec.unsafe_file_write` | File write using request-controlled path/content | high | high |
| `sec.headers_weakened` | Helmet/CSP/HSTS/XFO removed or disabled | high | confirmed / high |
| `sec.sensitive_logging` | Secrets/credentials logged | medium | high |
| `sec.auth_middleware_removed` | Auth middleware/guard removed vs base | critical | confirmed / high |
| `sec.authz_check_removed` | Authorization check removed vs base | critical | confirmed / high |
| `dep.new_package` | New package / major bump / git\|tarball / lifecycle scripts | medium–high | high |
| `dep.advisory` | Known vulnerability from OSV for changed dependencies (or advisory lookup failed) | medium–critical | high / needs_review |
| `risk.untested_sensitive` | High-risk paths changed without test changes | medium | needs_review |

## Check signals (not rules)

Failed or missing required **typecheck**, **lint**, **tests**, or **build** become check findings and feed scoring / policy independently of the rule registry.

## Methodology

1. Prefer structured diff evidence over vague heuristics.
2. Never flag harmless public config as a secret without evidence.
3. Auth regression compares base branch content to current; relocation across renames does not block as confirmed removal.
4. Production-path scoping: skip tests, fixtures, docs, `scripts/`, and rule sources for security rules.
5. Every finding includes evidence snippets suitable for CI annotations.
6. Advisory lookups query OSV for new/upgraded packages only and never upload source.

## Ignoring / overriding

```yaml
ignore_rules:
  - sec.dangerously_set_html
severity_overrides:
  dep.new_package: low
dependencies:
  advisories: false
```
