import type { Finding } from '../core/types.js'
import type { Rule, RuleContext } from './interface.js'
import { resetFindingCounter } from './interface.js'
import { secretClientEnvRule, secretHardcodedRule } from './secrets/index.js'
import {
  childProcessRule,
  corsStarRule,
  dangerousHtmlRule,
  evalRule,
  sqlConcatRule,
  tlsInsecureRule,
} from './security/index.js'
import {
  authMiddlewareRemovedRule,
  authzCheckRemovedRule,
} from './regression/index.js'
import { depNewPackageRule, untestedSensitiveRule } from './deps-risk.js'

export const allRules: Rule[] = [
  secretHardcodedRule,
  secretClientEnvRule,
  evalRule,
  childProcessRule,
  sqlConcatRule,
  tlsInsecureRule,
  corsStarRule,
  dangerousHtmlRule,
  authMiddlewareRemovedRule,
  authzCheckRemovedRule,
  depNewPackageRule,
  untestedSensitiveRule,
]

export async function runRules(ctx: RuleContext): Promise<Finding[]> {
  resetFindingCounter()
  const findings: Finding[] = []
  for (const rule of allRules) {
    if (!rule.supports(ctx)) continue
    const result = await rule.run(ctx)
    findings.push(...result)
  }
  return findings
}
