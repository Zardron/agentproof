/**
 * Public Plugin SDK for AgentProof custom rules.
 *
 * Load plugins only through config `plugins: [...]` — never remotely at runtime.
 */
export { defineRule, definePlugin, createFinding } from './define.js'
export { loadPluginRules, assertSafePluginSpecifier } from './load.js'
export { addedLines, removedLines } from '../git/diff-engine.js'
export type {
  PluginContext,
  PluginDefinition,
  PluginDependencyInfo,
  RuleDefinition,
  CreateFindingInput,
  DiffFile,
  Finding,
  FindingEvidence,
  NormalizedDiff,
  ProjectModel,
  Policy,
  Rule,
  Severity,
  Confidence,
} from './types.js'
