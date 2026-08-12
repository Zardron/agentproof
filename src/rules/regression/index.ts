import type { DiffFile } from '../../core/types.js'
import type { Rule } from '../interface.js'
import { makeFinding } from '../interface.js'

const AUTH_MIDDLEWARE =
  /\b(authenticate|requireAuth|isAuthenticated|ensureAuth|passport\.authenticate|authMiddleware|authGuard|JwtAuthGuard|AuthGuard|UseGuards\s*\()/

const AUTHZ =
  /\b(requireRole|requirePermission|assertPermission|checkPermission|hasPermission|authorize|can\s*\(|ability\.can|allowedRoles|roles?\s*\.includes)/

function collectMatches(content: string, re: RegExp): string[] {
  const lines = content.split(/\r?\n/)
  const hits: string[] = []
  for (const line of lines) {
    if (re.test(line)) hits.push(line.trim())
  }
  return hits
}

function relocated(symbolLine: string, allCurrent: string): boolean {
  const token = symbolLine.match(/[A-Za-z_][A-Za-z0-9_\.]*/)?.[0]
  if (!token) return false
  return allCurrent.includes(token)
}

function analyzeRemoval(
  file: DiffFile,
  re: RegExp,
  allCurrentContents: string,
): Array<{ baseSnippet: string; relocated: boolean }> {
  if (!file.baseContent) return []
  const baseHits = collectMatches(file.baseContent, re)
  const currentHits = collectMatches(file.currentContent || '', re)
  const removed = baseHits.filter(
    (b) => !currentHits.some((c) => c.replace(/\s+/g, ' ') === b.replace(/\s+/g, ' ')),
  )
  return removed.map((baseSnippet) => ({
    baseSnippet,
    relocated: relocated(baseSnippet, allCurrentContents),
  }))
}

export const authMiddlewareRemovedRule: Rule = {
  id: 'sec.auth_middleware_removed',
  title: 'Authentication enforcement removed',
  category: 'regression',
  severity: 'critical',
  confidence: 'confirmed',
  supports: (ctx) => ctx.policy.security.auth_regression,
  async run(ctx) {
    const allCurrent = ctx.diff.files.map((f) => f.currentContent).join('\n')
    const findings = []
    for (const file of ctx.diff.files) {
      if (!/\.[cm]?[jt]sx?$/.test(file.path) && !file.path.includes('auth')) continue
      const removals = analyzeRemoval(file, AUTH_MIDDLEWARE, allCurrent)
      for (const rem of removals) {
        findings.push(
          makeFinding(authMiddlewareRemovedRule, {
            message: rem.relocated
              ? 'Authentication enforcement may have moved; verify coverage'
              : 'Authentication enforcement present on the base branch was removed',
            file: file.path,
            confidence: rem.relocated ? 'needs_review' : 'confirmed',
            severity: rem.relocated ? 'high' : 'critical',
            evidence: {
              baseSnippet: rem.baseSnippet.slice(0, 200),
              currentSnippet: '(removed)',
            },
            remediation: 'Restore authentication middleware/guards or document an intentional public endpoint.',
          }),
        )
      }
    }
    return findings
  },
}

export const authzCheckRemovedRule: Rule = {
  id: 'sec.authz_check_removed',
  title: 'Authorization check removed',
  category: 'regression',
  severity: 'critical',
  confidence: 'confirmed',
  supports: (ctx) => ctx.policy.security.auth_regression,
  async run(ctx) {
    const allCurrent = ctx.diff.files.map((f) => f.currentContent).join('\n')
    const findings = []
    for (const file of ctx.diff.files) {
      const removals = analyzeRemoval(file, AUTHZ, allCurrent)
      for (const rem of removals) {
        findings.push(
          makeFinding(authzCheckRemovedRule, {
            message: rem.relocated
              ? 'Authorization check may have moved; verify enforcement'
              : 'Authorization enforcement present on the base branch was removed',
            file: file.path,
            confidence: rem.relocated ? 'needs_review' : 'confirmed',
            severity: rem.relocated ? 'high' : 'critical',
            evidence: {
              baseSnippet: rem.baseSnippet.slice(0, 200),
              currentSnippet: '(removed)',
            },
            remediation: 'Restore role/permission checks before merging.',
          }),
        )
      }
    }
    return findings
  },
}
