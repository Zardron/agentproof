import type {
  Confidence,
  DiffFile,
  Finding,
  FindingEvidence,
  NormalizedDiff,
  ProjectModel,
  Severity,
} from '../core/types.js'
import type { Policy } from '../policy/schema.js'
import type { Rule } from '../rules/interface.js'

/** Stable, intentional surface for custom rule authors. */
export interface PluginDependencyInfo {
  added: Array<{ name: string; version: string }>
  majors: Array<{ name: string; from: string; to: string }>
  risky: Array<{ name: string; version: string }>
  lifecycle: string[]
  packageJsonChanged: boolean
}

export interface PluginContext {
  /** Project root (cwd used for the AgentProof run). */
  cwd: string
  project: ProjectModel
  /** Resolved policy after extends / defaults. */
  policy: Policy
  diff: NormalizedDiff
  dependencies: PluginDependencyInfo
}

export interface RuleDefinition {
  id: string
  title: string
  severity: Severity
  category?: string
  confidence?: Confidence
  /** Return false to skip this rule for the current project. */
  supports?: (context: PluginContext) => boolean
  /** Deterministic analysis — must not perform network I/O. */
  analyze: (context: PluginContext) => Finding[] | Promise<Finding[]>
}

export interface PluginDefinition {
  name: string
  rules: Rule[]
}

export interface CreateFindingInput {
  ruleId: string
  title: string
  message: string
  severity: Severity
  confidence?: Confidence
  category?: string
  file?: string
  line?: number
  evidence?: FindingEvidence
  remediation?: string
}

export type { DiffFile, Finding, FindingEvidence, NormalizedDiff, ProjectModel, Severity, Confidence, Policy, Rule }
