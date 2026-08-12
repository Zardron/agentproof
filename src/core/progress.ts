import type {
  CheckResult,
  FrameworkId,
  ProgressCallback,
  ProgressEvent,
  ProgressStage,
  ProgressStatus,
  ProjectModel,
} from './types.js'

export type { ProgressCallback, ProgressEvent, ProgressStage, ProgressStatus }

const FRAMEWORK_LABEL: Record<FrameworkId, string> = {
  node: 'Node.js',
  express: 'Express',
  fastify: 'Fastify',
  hono: 'Hono',
  nestjs: 'NestJS',
  react: 'React',
  vite: 'Vite',
  nextjs: 'Next.js',
  remix: 'Remix',
  astro: 'Astro',
  nuxt: 'Nuxt',
  vue: 'Vue',
  sveltekit: 'SvelteKit',
  angular: 'Angular',
}

const PRIMARY_FRAMEWORKS = new Set<FrameworkId>([
  'nextjs',
  'nuxt',
  'remix',
  'sveltekit',
  'astro',
  'angular',
  'nestjs',
])

const IMPLIED_FRAMEWORKS = new Set<FrameworkId>(['react', 'vue', 'vite'])

export const STAGE_FAILURE_LABEL: Record<ProgressStage, string> = {
  config: 'loading configuration',
  detect: 'detecting project',
  diff: 'generating Git diff',
  typecheck: 'running typecheck',
  lint: 'running lint',
  tests: 'running tests',
  build: 'running build',
  dependencies: 'analyzing dependencies',
  security: 'running security checks',
  risk: 'calculating production readiness',
  report: 'generating report',
  html: 'writing HTML report',
}

export function emitProgress(
  onProgress: ProgressCallback | undefined,
  event: ProgressEvent,
): void {
  onProgress?.(event)
}

export function formatDuration(ms?: number): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return ''
  if (ms < 1000) return ` (${Math.round(ms)}ms)`
  return ` (${(ms / 1000).toFixed(1)}s)`
}

export function statusFromCheck(status: CheckResult['status']): ProgressStatus {
  if (status === 'passed') return 'passed'
  if (status === 'failed') return 'failed'
  if (status === 'warned') return 'warning'
  return 'skipped'
}

export function messageForCheck(title: string, result: CheckResult): string {
  if (result.id === 'dependencies') {
    if (result.status === 'passed') return 'Dependency analysis complete'
    if (result.status === 'failed') return 'Dependency analysis failed'
    if (result.status === 'warned') return 'Dependency analysis warning'
    return 'Dependency analysis skipped'
  }
  if (result.status === 'passed') return `${title} passed`
  if (result.status === 'failed') return `${title} failed`
  if (result.status === 'warned') return `${title} warning`
  if (/not configured/i.test(result.summary)) return `${title} not configured`
  return `${title} skipped`
}

export function eventFromCheck(
  stage: ProgressStage,
  title: string,
  result: CheckResult,
): ProgressEvent {
  return {
    stage,
    status: statusFromCheck(result.status),
    message: messageForCheck(title, result),
    durationMs: result.durationMs,
  }
}

export function diffRunningMessage(options: {
  staged: boolean
  base?: string
  revision?: string
}): string {
  if (options.staged) return 'Analyzing staged changes...'
  if (options.base) return `Comparing current branch against ${options.base}...`
  if (options.revision) return `Comparing against ${options.revision}...`
  return 'Analyzing local changes...'
}

export function gitChangesDetectedMessage(count: number): string {
  return `Git changes detected: ${count} file${count === 1 ? '' : 's'}`
}

export function fileCountLabel(count: number): string {
  return `${count} changed file${count === 1 ? '' : 's'}`
}

export function formatDetectedStack(
  project: Pick<ProjectModel, 'frameworks' | 'language' | 'packageManager'>,
): string {
  let ids = project.frameworks.filter((id) => id !== 'node')
  if (ids.some((id) => PRIMARY_FRAMEWORKS.has(id))) {
    ids = ids.filter((id) => !IMPLIED_FRAMEWORKS.has(id))
  }
  const fw = ids.map((id) => FRAMEWORK_LABEL[id] ?? id).join(' + ') || 'Node.js'
  const lang =
    project.language === 'typescript'
      ? 'TypeScript'
      : project.language === 'javascript'
        ? 'JavaScript'
        : 'TypeScript/JavaScript'
  return `${fw} + ${lang} + ${project.packageManager}`
}

export function projectDetectedMessage(
  project: Pick<ProjectModel, 'frameworks' | 'language' | 'packageManager'>,
): string {
  return `Project detected: ${formatDetectedStack(project)}`
}

export function shouldDisplayProgressEvent(
  event: ProgressEvent,
  options: { verbose?: boolean } = {},
): boolean {
  if (event.status === 'failed') return true
  if (options.verbose) return true
  return event.stage !== 'config' && event.stage !== 'report'
}
