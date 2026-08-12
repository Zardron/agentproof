import type { Finding } from '../core/types.js'
import type { Rule, RuleContext } from '../rules/interface.js'
import { makeFinding } from '../rules/interface.js'
import { dependencyFindingInputs } from '../checks/dependencies.js'
import type {
  CreateFindingInput,
  PluginContext,
  PluginDefinition,
  RuleDefinition,
} from './types.js'

function toPluginContext(ctx: RuleContext): PluginContext {
  return {
    cwd: ctx.project.root,
    project: ctx.project,
    policy: ctx.policy,
    diff: ctx.diff,
    dependencies: dependencyFindingInputs(ctx.project, ctx.diff),
  }
}

/**
 * Define a custom AgentProof rule.
 * Wraps the internal `Rule` interface without exposing registry wiring.
 */
export function defineRule(definition: RuleDefinition): Rule {
  if (!definition.id?.trim()) {
    throw new Error('defineRule requires a non-empty id')
  }
  if (!definition.title?.trim()) {
    throw new Error(`defineRule(${definition.id}) requires a title`)
  }
  if (typeof definition.analyze !== 'function') {
    throw new Error(`defineRule(${definition.id}) requires an analyze() function`)
  }

  const category = definition.category ?? 'custom'
  const confidence = definition.confidence ?? 'high'

  return {
    id: definition.id,
    title: definition.title,
    category,
    severity: definition.severity,
    confidence,
    supports(projectCtx) {
      if (!definition.supports) return true
      // supports() may run before a diff exists in theory; plugins receive an empty diff.
      const ctx: PluginContext = {
        cwd: projectCtx.project.root,
        project: projectCtx.project,
        policy: projectCtx.policy,
        diff: { baseRef: '', headRef: '', staged: false, files: [] },
        dependencies: { added: [], majors: [], risky: [], lifecycle: [], packageJsonChanged: false },
      }
      return definition.supports(ctx)
    },
    async run(ctx) {
      return definition.analyze(toPluginContext(ctx))
    },
  }
}

/** Group one or more rules into a loadable plugin module. */
export function definePlugin(definition: PluginDefinition): PluginDefinition {
  if (!definition.name?.trim()) {
    throw new Error('definePlugin requires a non-empty name')
  }
  if (!Array.isArray(definition.rules) || definition.rules.length === 0) {
    throw new Error(`definePlugin(${definition.name}) requires at least one rule`)
  }
  return definition
}

/** Build a standardized Finding for plugin rules. */
export function createFinding(input: CreateFindingInput): Finding {
  return makeFinding(
    {
      id: input.ruleId,
      title: input.title,
      category: input.category ?? 'custom',
      severity: input.severity,
      confidence: input.confidence ?? 'high',
    },
    {
      message: input.message,
      file: input.file,
      line: input.line,
      evidence: input.evidence ?? {},
      remediation: input.remediation,
      severity: input.severity,
      confidence: input.confidence,
    },
  )
}
