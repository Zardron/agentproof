export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type Confidence = 'confirmed' | 'high' | 'needs_review'
export type MergeStatus = 'PASS' | 'REVIEW' | 'BLOCKED'
export type ChangeRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type FrameworkId =
  | 'node'
  | 'express'
  | 'fastify'
  | 'hono'
  | 'nestjs'
  | 'react'
  | 'vite'
  | 'nextjs'
  | 'remix'
  | 'astro'
  | 'nuxt'
  | 'vue'
  | 'sveltekit'
  | 'angular'

export type RiskDomain =
  | 'authentication'
  | 'authorization'
  | 'payments'
  | 'billing'
  | 'customer_data'
  | 'database'
  | 'migrations'
  | 'environment_config'
  | 'api_routes'
  | 'infrastructure'
  | 'deployment'
  | 'dependencies'
  | 'build_tooling'
  | 'frontend_only'
  | 'tests'
  | 'documentation'
  | 'other'

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export interface ProjectModel {
  root: string
  runtime: 'node'
  language: 'typescript' | 'javascript' | 'mixed'
  packageManager: PackageManager
  frameworks: FrameworkId[]
  build: { command: string | null; tool: string | null }
  test: {
    command: string | null
    runner: 'jest' | 'vitest' | 'node' | 'unknown' | null
  }
  lint: { command: string | null; tool: 'eslint' | 'biome' | null }
  orm: 'prisma' | 'drizzle' | 'typeorm' | 'none'
  monorepo: { kind: 'pnpm' | 'nx' | 'turbo' | 'none'; packages: string[] }
  ci: { provider: 'github' | 'gitlab' | 'other' | 'none' }
  envPrefixes: string[]
  packageJsonScripts: Record<string, string>
}

export interface DiffHunkLine {
  type: 'add' | 'del' | 'normal'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

export interface DiffHunk {
  oldStart: number
  newStart: number
  lines: DiffHunkLine[]
}

export interface DiffFile {
  path: string
  oldPath?: string
  status: 'A' | 'M' | 'D' | 'R'
  language: 'typescript' | 'javascript' | 'json' | 'env' | 'other'
  riskDomains: RiskDomain[]
  hunks: DiffHunk[]
  baseContent: string
  currentContent: string
}

export interface NormalizedDiff {
  baseRef: string
  headRef: string
  files: DiffFile[]
  staged: boolean
}

export interface FindingEvidence {
  baseSnippet?: string
  currentSnippet?: string
}

export interface Finding {
  id: string
  ruleId: string
  title: string
  severity: Severity
  confidence: Confidence
  message: string
  file?: string
  line?: number
  evidence: FindingEvidence
  remediation?: string
  category: string
}

export type CheckStatus = 'passed' | 'failed' | 'skipped' | 'warned'

export interface CheckResult {
  id: string
  title: string
  status: CheckStatus
  summary: string
  details?: string
  durationMs?: number
}

export interface CliOptions {
  cwd: string
  base?: string
  revision?: string
  staged: boolean
  json: boolean
  sarif: boolean
  html?: string
  ci: boolean
  configPath?: string
  skipChecks: boolean
}

export interface ReportModel {
  project: ProjectModel
  diff: NormalizedDiff
  checks: CheckResult[]
  findings: Finding[]
  changeRisk: ChangeRisk
  readiness: number
  mergeStatus: MergeStatus
  blockedReasons: string[]
}
