import { addedLines, removedLines } from '../../git/diff-engine.js'
import { isNonProductionPath } from '../../git/classify.js'
import type { Rule } from '../interface.js'
import { makeFinding } from '../interface.js'

export const evalRule: Rule = {
  id: 'sec.eval',
  title: 'Unsafe eval / Function',
  category: 'security',
  severity: 'high',
  confidence: 'confirmed',
  supports: () => true,
  async run(ctx) {
    const findings = []
    for (const file of ctx.diff.files) {
      if (isNonProductionPath(file.path)) continue
      if (!/\.[cm]?[jt]sx?$/.test(file.path)) continue
      for (const { line, content } of addedLines(file)) {
        if (/^\s*(\/\/|\/\*|\*)/.test(content)) continue
        if (/\beval\s*\(/.test(content) || /\bnew\s+Function\s*\(/.test(content)) {
          findings.push(
            makeFinding(evalRule, {
              message: 'Introduced eval/Function which can execute arbitrary code',
              file: file.path,
              line,
              evidence: { currentSnippet: content.trim().slice(0, 160) },
              remediation: 'Avoid eval/new Function; use safe parsers or explicit allow-listed operations.',
            }),
          )
        }
      }
    }
    return findings
  },
}

export const childProcessRule: Rule = {
  id: 'sec.child_process',
  title: 'Shell execution with dynamic input',
  category: 'security',
  severity: 'high',
  confidence: 'high',
  supports: () => true,
  async run(ctx) {
    const findings = []
    for (const file of ctx.diff.files) {
      if (isNonProductionPath(file.path)) continue
      if (!/\.[cm]?[jt]sx?$/.test(file.path)) continue
      for (const { line, content } of addedLines(file)) {
        const hit =
          /\b(?:exec|execSync|spawn|spawnSync|execFile|execFileSync)\s*\(/.test(content) ||
          /\bchild_process\b/.test(content)
        if (!hit) continue
        const literalOnly = /\b(?:exec|execSync|spawn|spawnSync)\s*\(\s*['"`][^'"`]+['"`]\s*[,)]/.test(
          content,
        )
        findings.push(
          makeFinding(childProcessRule, {
            message: 'Command execution API introduced in diff',
            file: file.path,
            line,
            confidence: literalOnly ? 'needs_review' : 'high',
            evidence: { currentSnippet: content.trim().slice(0, 160) },
            remediation: 'Avoid shelling out with user-controlled input; use argument arrays and strict validation.',
          }),
        )
      }
    }
    return findings
  },
}

export const sqlConcatRule: Rule = {
  id: 'sec.sql_concat',
  title: 'Unsafe SQL string construction',
  category: 'security',
  severity: 'high',
  confidence: 'high',
  supports: () => true,
  async run(ctx) {
    const findings = []
    for (const file of ctx.diff.files) {
      if (isNonProductionPath(file.path)) continue
      if (!/\.[cm]?[jt]sx?$/.test(file.path)) continue
      for (const { line, content } of addedLines(file)) {
        const sqly =
          /\b(query|execute|\.raw|\bsql)\s*\(\s*[`'"][^`'"]*(\+|\$\{)/.test(content) ||
          /(['"`])\s*(SELECT|INSERT|UPDATE|DELETE)\b[\s\S]*\1\s*\+/.test(content) ||
          /`(SELECT|INSERT|UPDATE|DELETE)\b[\s\S]*\$\{/.test(content)
        if (sqly) {
          findings.push(
            makeFinding(sqlConcatRule, {
              message: 'Possible string-concatenated SQL in diff',
              file: file.path,
              line,
              evidence: { currentSnippet: content.trim().slice(0, 160) },
              remediation: 'Use parameterized queries / tagged SQL templates with bound parameters.',
            }),
          )
        }
      }
    }
    return findings
  },
}

export const tlsInsecureRule: Rule = {
  id: 'sec.tls_insecure',
  title: 'TLS verification disabled',
  category: 'security',
  severity: 'critical',
  confidence: 'confirmed',
  supports: () => true,
  async run(ctx) {
    const findings = []
    for (const file of ctx.diff.files) {
      if (isNonProductionPath(file.path)) continue
      for (const { line, content } of addedLines(file)) {
        if (
          /rejectUnauthorized\s*:\s*false/.test(content) ||
          /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0['"]?/.test(content)
        ) {
          findings.push(
            makeFinding(tlsInsecureRule, {
              message: 'TLS certificate verification disabled',
              file: file.path,
              line,
              evidence: { currentSnippet: content.trim().slice(0, 160) },
              remediation: 'Do not disable TLS verification in production code.',
            }),
          )
        }
      }
    }
    return findings
  },
}

export const corsStarRule: Rule = {
  id: 'sec.cors_star',
  title: 'Insecure CORS configuration',
  category: 'security',
  severity: 'high',
  confidence: 'high',
  supports: () => true,
  async run(ctx) {
    const findings = []
    for (const file of ctx.diff.files) {
      if (isNonProductionPath(file.path)) continue
      const content = file.currentContent || addedLines(file).map((l) => l.content).join('\n')
      const hasStar =
        /origin\s*:\s*['"`]\*['"`]/.test(content) ||
        /Access-Control-Allow-Origin['"`]\s*,\s*['"`]\*/.test(content)
      const hasCreds =
        /credentials\s*:\s*true/.test(content) ||
        /Access-Control-Allow-Credentials['"`]\s*,\s*['"`]true/.test(content)
      if (hasStar && hasCreds) {
        const line =
          addedLines(file).find((l) => /origin\s*:/.test(l.content) || /credentials\s*:/.test(l.content))
            ?.line ?? 1
        findings.push(
          makeFinding(corsStarRule, {
            message: "CORS origin '*' combined with credentials is insecure",
            file: file.path,
            line,
            evidence: {
              currentSnippet: "origin: '*' with credentials: true",
            },
            remediation: 'Reflect an allow-list of origins instead of wildcard when credentials are enabled.',
          }),
        )
      }
    }
    return findings
  },
}

export const dangerousHtmlRule: Rule = {
  id: 'sec.dangerously_set_html',
  title: 'Unsafe HTML injection sink',
  category: 'security',
  severity: 'medium',
  confidence: 'needs_review',
  supports: () => true,
  async run(ctx) {
    const findings = []
    for (const file of ctx.diff.files) {
      if (isNonProductionPath(file.path)) continue
      for (const { line, content } of addedLines(file)) {
        if (
          /dangerouslySetInnerHTML/.test(content) ||
          /\.innerHTML\s*=/.test(content)
        ) {
          const staticLiteral = /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html:\s*['"`][^'"`]*['"`]/.test(
            content,
          )
          findings.push(
            makeFinding(dangerousHtmlRule, {
              message: 'HTML injection sink introduced',
              file: file.path,
              line,
              confidence: staticLiteral ? 'needs_review' : 'needs_review',
              severity: staticLiteral ? 'low' : 'medium',
              evidence: { currentSnippet: content.trim().slice(0, 160) },
              remediation: 'Sanitize HTML or avoid injecting untrusted markup.',
            }),
          )
        }
      }
    }
    return findings
  },
}

export const openRedirectRule: Rule = {
  id: 'sec.open_redirect',
  title: 'Dangerous redirect',
  category: 'security',
  severity: 'high',
  confidence: 'high',
  supports: () => true,
  async run(ctx) {
    const findings = []
    for (const file of ctx.diff.files) {
      if (isNonProductionPath(file.path)) continue
      if (!/\.[cm]?[jt]sx?$/.test(file.path)) continue
      for (const { line, content } of addedLines(file)) {
        if (/^\s*(\/\/|\/\*|\*)/.test(content)) continue
        const hit =
          /\b(?:res|response)\.redirect\s*\(\s*(?:req\.|request\.|url|searchParams|query|params)/.test(
            content,
          ) ||
          /\b(?:redirect|NextResponse\.redirect|Response\.redirect)\s*\(\s*(?:req\.|request\.|url|searchParams|query|params|new\s+URL\s*\()/.test(
            content,
          ) ||
          /\blocation\s*=\s*(?:req\.|request\.|searchParams)/.test(content)
        if (!hit) continue
        findings.push(
          makeFinding(openRedirectRule, {
            message: 'Possible open redirect using request-controlled destination',
            file: file.path,
            line,
            evidence: { currentSnippet: content.trim().slice(0, 160) },
            remediation:
              'Allow-list redirect targets or map tokens to known internal paths; never redirect to raw user input.',
          }),
        )
      }
    }
    return findings
  },
}

export const pathTraversalRule: Rule = {
  id: 'sec.path_traversal',
  title: 'Path traversal risk',
  category: 'security',
  severity: 'high',
  confidence: 'high',
  supports: () => true,
  async run(ctx) {
    const findings = []
    for (const file of ctx.diff.files) {
      if (isNonProductionPath(file.path)) continue
      if (!/\.[cm]?[jt]sx?$/.test(file.path)) continue
      for (const { line, content } of addedLines(file)) {
        if (/^\s*(\/\/|\/\*|\*)/.test(content)) continue
        const hit =
          /\b(?:path\.(?:join|resolve)|join|resolve)\s*\([^)]*(?:req\.|request\.|params\.|query\.|searchParams)/.test(
            content,
          ) ||
          /\b(?:readFile|readFileSync|createReadStream|access|stat)\s*\([^)]*(?:req\.|request\.|params\.|query\.)/.test(
            content,
          ) ||
          /['"`][^'"`]*\.\.\/[^'"`]*['"`]\s*\+|`[^`]*\$\{[^}]*(?:req|request|params|query)/.test(
            content,
          )
        if (!hit) continue
        findings.push(
          makeFinding(pathTraversalRule, {
            message: 'Filesystem path built from request input (path traversal risk)',
            file: file.path,
            line,
            evidence: { currentSnippet: content.trim().slice(0, 160) },
            remediation:
              'Resolve under a fixed root and reject paths that escape it; never pass raw user input to filesystem APIs.',
          }),
        )
      }
    }
    return findings
  },
}

export const unsafeFileWriteRule: Rule = {
  id: 'sec.unsafe_file_write',
  title: 'Unsafe file write',
  category: 'security',
  severity: 'high',
  confidence: 'high',
  supports: () => true,
  async run(ctx) {
    const findings = []
    for (const file of ctx.diff.files) {
      if (isNonProductionPath(file.path)) continue
      if (!/\.[cm]?[jt]sx?$/.test(file.path)) continue
      for (const { line, content } of addedLines(file)) {
        if (/^\s*(\/\/|\/\*|\*)/.test(content)) continue
        const hit =
          /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|outputFile|outputFileSync)\s*\([^)]*(?:req\.|request\.|params\.|query\.|body)/.test(
            content,
          )
        if (!hit) continue
        findings.push(
          makeFinding(unsafeFileWriteRule, {
            message: 'File write uses request-controlled path or content',
            file: file.path,
            line,
            evidence: { currentSnippet: content.trim().slice(0, 160) },
            remediation:
              'Write only to allow-listed paths with validated names; never use raw request paths for writes.',
          }),
        )
      }
    }
    return findings
  },
}

export const headersWeakenedRule: Rule = {
  id: 'sec.headers_weakened',
  title: 'Security headers weakened',
  category: 'security',
  severity: 'high',
  confidence: 'high',
  supports: () => true,
  async run(ctx) {
    const findings = []
    for (const file of ctx.diff.files) {
      if (isNonProductionPath(file.path)) continue
      const current = file.currentContent || ''

      for (const { line, content } of removedLines(file)) {
        const looksLikeHeader =
          /\bhelmet\b/.test(content) ||
          /content-security-policy/i.test(content) ||
          /x-frame-options/i.test(content) ||
          /strict-transport-security/i.test(content) ||
          /x-content-type-options/i.test(content)
        if (!looksLikeHeader) continue
        const snippet = content.trim().slice(0, 80)
        if (snippet && current.includes(snippet)) continue
        findings.push(
          makeFinding(headersWeakenedRule, {
            message: 'Security header / helmet middleware removed',
            file: file.path,
            line,
            confidence: 'confirmed',
            evidence: { baseSnippet: content.trim().slice(0, 160) },
            remediation:
              'Restore security headers (helmet/CSP/HSTS/XFO) unless replaced equivalently.',
          }),
        )
      }

      for (const { line, content } of addedLines(file)) {
        if (/^\s*(\/\/|\/\*|\*)/.test(content)) continue
        if (
          /contentSecurityPolicy\s*:\s*false/.test(content) ||
          /xFrameOptions\s*:\s*false/.test(content) ||
          /hsts\s*:\s*false/.test(content)
        ) {
          findings.push(
            makeFinding(headersWeakenedRule, {
              message: 'Security header protection disabled',
              file: file.path,
              line,
              evidence: { currentSnippet: content.trim().slice(0, 160) },
              remediation: 'Keep CSP/HSTS/frame protections enabled with a tight policy.',
            }),
          )
        }
      }
    }
    return findings
  },
}

export const sensitiveLoggingRule: Rule = {
  id: 'sec.sensitive_logging',
  title: 'Sensitive data logged',
  category: 'security',
  severity: 'medium',
  confidence: 'high',
  supports: () => true,
  async run(ctx) {
    const findings = []
    for (const file of ctx.diff.files) {
      if (isNonProductionPath(file.path)) continue
      if (!/\.[cm]?[jt]sx?$/.test(file.path)) continue
      for (const { line, content } of addedLines(file)) {
        if (/^\s*(\/\/|\/\*|\*)/.test(content)) continue
        const hit =
          /\b(?:console\.(?:log|info|debug|warn|error)|logger\.(?:log|info|debug|warn|error|trace)|log\.(?:info|debug|warn|error))\s*\([^)]*\b(?:password|passwd|secret|token|api[_-]?key|authorization|auth[_-]?header|private[_-]?key|credit[_-]?card|ssn)\b/i.test(
            content,
          ) ||
          /\b(?:password|passwd|secret|token|apiKey|api_key|authorization)\s*[:=]\s*[^,\n)]+\s*[,)].*(?:console|logger|log)\./i.test(
            content,
          )
        if (!hit) continue
        findings.push(
          makeFinding(sensitiveLoggingRule, {
            message: 'Possible logging of secrets or credentials',
            file: file.path,
            line,
            evidence: { currentSnippet: content.trim().slice(0, 160) },
            remediation: 'Redact secrets before logging; log identifiers only, never raw tokens/passwords.',
          }),
        )
      }
    }
    return findings
  },
}
