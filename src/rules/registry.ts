import type { Finding } from '../core/types.js'
import type { Rule, RuleContext } from './interface.js'
import { resetFindingCounter } from './interface.js'
import { secretClientEnvRule, secretHardcodedRule } from './secrets/index.js'
import {
  childProcessRule,
  corsStarRule,
  dangerousHtmlRule,
  evalRule,
  headersWeakenedRule,
  openRedirectRule,
  pathTraversalRule,
  sensitiveLoggingRule,
  sqlConcatRule,
  tlsInsecureRule,
  unsafeFileWriteRule,
} from './security/index.js'
import {
  authMiddlewareRemovedRule,
  authzCheckRemovedRule,
} from './regression/index.js'
import { depNewPackageRule, untestedSensitiveRule } from './deps-risk.js'
import { loadPluginRules } from '../plugin/load.js'

export const allRules: Rule[] = [
  secretHardcodedRule,
  secretClientEnvRule,
  evalRule,
  childProcessRule,
  sqlConcatRule,
  tlsInsecureRule,
  corsStarRule,
  dangerousHtmlRule,
  openRedirectRule,
  pathTraversalRule,
  unsafeFileWriteRule,
  headersWeakenedRule,
  sensitiveLoggingRule,
  authMiddlewareRemovedRule,
  authzCheckRemovedRule,
  depNewPackageRule,
  untestedSensitiveRule,
]

export async function runRules(ctx: RuleContext): Promise<Finding[]> {
  resetFindingCounter()
  const pluginRules = await loadPluginRules(ctx.project.root, ctx.policy.plugins ?? [])
  const builtinIds = new Set(allRules.map((rule) => rule.id))
  for (const rule of pluginRules) {
    if (builtinIds.has(rule.id)) {
      throw new Error(
        `Plugin rule id "${rule.id}" conflicts with a built-in AgentProof rule. Choose a unique id (e.g. company.rule-name).`,
      )
    }
  }
  const findings: Finding[] = []
  for (const rule of [...allRules, ...pluginRules]) {
    if (!rule.supports(ctx)) continue
    const result = await rule.run(ctx)
    findings.push(...result)
  }
  return findings
}
