import { addedLines } from '../../git/diff-engine.js'
import { isNonProductionPath, isTestPath } from '../../git/classify.js'
import type { Rule } from '../interface.js'
import { makeFinding } from '../interface.js'

const PLACEHOLDER = /(EXAMPLE|YOUR_|CHANGEME|xxx+|TODO|placeholder|dummy|sample)/i
const ALLOWED_FILES = /(\.env\.example|\.env\.sample|\.env\.template|README|\.md$|false-positives\/)/i

const SECRET_ASSIGN =
  /(?:(?:api[_-]?key|secret|token|password|passwd|private[_-]?key|access[_-]?key|auth[_-]?token|database_url|db_url|client_secret)\s*[:=]\s*['"`]([^'"`]{8,})['"`])/i

const AWS_KEY = /\bAKIA[0-9A-Z]{16}\b/
const PEM = /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/
const GH_TOKEN = /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/
const SLACK = /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/

function entropyScore(s: string): number {
  const freq = new Map<string, number>()
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1)
  let h = 0
  for (const c of freq.values()) {
    const p = c / s.length
    h -= p * Math.log2(p)
  }
  return h
}

export const secretHardcodedRule: Rule = {
  id: 'secret.hardcoded',
  title: 'Hardcoded secret',
  category: 'secrets',
  severity: 'critical',
  confidence: 'high',
  supports: (ctx) => ctx.policy.security.secret_detection,
  async run(ctx) {
    const findings = []
    for (const file of ctx.diff.files) {
      if (ALLOWED_FILES.test(file.path) || isNonProductionPath(file.path)) continue
      if (file.status === 'D') continue

      const lines = addedLines(file)
      // also scan .env current content additions
      for (const { line, content } of lines) {
        if (PLACEHOLDER.test(content)) continue

        if (PEM.test(content) || AWS_KEY.test(content) || GH_TOKEN.test(content) || SLACK.test(content)) {
          findings.push(
            makeFinding(secretHardcodedRule, {
              message: 'Likely secret material introduced in diff',
              file: file.path,
              line,
              confidence: 'confirmed',
              evidence: { currentSnippet: content.slice(0, 120) },
              remediation: 'Remove the secret, rotate it, and load from a secret manager or env var outside git.',
            }),
          )
          continue
        }

        const m = content.match(SECRET_ASSIGN)
        if (m?.[1]) {
          const value = m[1]
          if (PLACEHOLDER.test(value)) continue
          const conf = entropyScore(value) >= 3.5 ? 'high' : 'needs_review'
          findings.push(
            makeFinding(secretHardcodedRule, {
              message: `Possible hardcoded secret assigned in ${file.path}`,
              file: file.path,
              line,
              confidence: conf,
              severity: conf === 'needs_review' ? 'high' : 'critical',
              evidence: { currentSnippet: content.replace(value, '[REDACTED]').slice(0, 160) },
              remediation: 'Move secrets to environment variables or a vault; do not commit them.',
            }),
          )
        }

        if (/(^|\/)\.env(\.|$)/.test(file.path) && /=.+/.test(content) && !content.trim().startsWith('#')) {
          const val = content.split('=').slice(1).join('=').trim()
          if (val && !PLACEHOLDER.test(val) && val.length > 6) {
            findings.push(
              makeFinding(secretHardcodedRule, {
                message: 'Sensitive .env value appears in the diff',
                file: file.path,
                line,
                confidence: 'high',
                evidence: { currentSnippet: `${content.split('=')[0]}=[REDACTED]` },
                remediation: 'Ensure .env files are gitignored; commit only .env.example with placeholders.',
              }),
            )
          }
        }
      }
    }
    return findings
  },
}

export const secretClientEnvRule: Rule = {
  id: 'secret.client_env',
  title: 'Secret in public client env',
  category: 'secrets',
  severity: 'high',
  confidence: 'high',
  supports: (ctx) => ctx.policy.security.secret_detection,
  async run(ctx) {
    const prefixes = ctx.project.envPrefixes.length
      ? ctx.project.envPrefixes
      : ['NEXT_PUBLIC_', 'VITE_', 'NUXT_PUBLIC_']
    const findings = []
    const secretName = /(SECRET|TOKEN|PASSWORD|PRIVATE|API_KEY|DATABASE|CREDENTIAL)/i

    for (const file of ctx.diff.files) {
      if (isTestPath(file.path) || ALLOWED_FILES.test(file.path)) continue
      for (const { line, content } of addedLines(file)) {
        for (const prefix of prefixes) {
          const re = new RegExp(`${prefix}([A-Z0-9_]+)\\s*=\\s*['"\`]?([^'"\`\\s]+)`)
          const m = content.match(re)
          if (!m) continue
          const name = m[1] ?? ''
          const value = m[2] ?? ''
          if (!secretName.test(name) && !secretName.test(prefix + name)) continue
          if (PLACEHOLDER.test(value)) continue
          findings.push(
            makeFinding(secretClientEnvRule, {
              message: `Secret-like value exposed via public env prefix ${prefix}`,
              file: file.path,
              line,
              evidence: {
                currentSnippet: `${prefix}${name}=[REDACTED]`,
              },
              remediation: 'Public env prefixes are embedded in client bundles. Use server-only env vars for secrets.',
            }),
          )
        }
      }
    }
    return findings
  },
}
