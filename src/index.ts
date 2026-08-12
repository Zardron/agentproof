/**
 * Public programmatic API for AgentProof.
 * Prefer the `agentproof` CLI for most workflows.
 */
export { runPipeline } from './core/pipeline.js'
export { getVersion } from './core/version.js'
export { emitProgress, formatDuration } from './core/progress.js'
export {
  EXIT_PASS,
  EXIT_REVIEW,
  EXIT_BLOCKED,
  EXIT_ERROR,
  exitCodeForMergeStatus,
} from './core/exit-codes.js'
export { detectProject } from './detect/project.js'
export { describeProject } from './detect/frameworks/index.js'
export { loadPolicy, defaultPolicy, policySchema } from './policy/schema.js'
export type { Policy } from './policy/schema.js'
export {
  listBuiltinPackNames,
  loadPack,
  mergePolicyLayers,
} from './policy/packs.js'
export type {
  ChangeRisk,
  CheckResult,
  CheckStatus,
  CliOptions,
  Confidence,
  Finding,
  FrameworkId,
  MergeStatus,
  NormalizedDiff,
  PackageManager,
  ProjectModel,
  ReportModel,
  RiskDomain,
  Severity,
  ProgressCallback,
  ProgressEvent,
  ProgressStage,
  ProgressStatus,
  TestImpactReport,
} from './core/types.js'
