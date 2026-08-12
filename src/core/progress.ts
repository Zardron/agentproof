import type { CheckResult, ProgressCallback, ProgressEvent, ProgressStage, ProgressStatus } from './types.js'

export type { ProgressCallback, ProgressEvent, ProgressStage, ProgressStatus }

export const STAGE_FAILURE_LABEL: Record<ProgressStage, string> = {
  config: 'loading configuration',
  detect: 'detecting project',
  diff: 'generating Git diff',
  typecheck: 'running typecheck',
  lint: 'running lint',
  tests: 'running tests',
  build: 'running build',
  dependencies: 'analyzing dependencies',
  security: 'running security analysis',
  risk: 'calculating risk',
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

export function diffCompletedMessage(options: {
  staged: boolean
  base?: string
  revision?: string
}): string {
  if (options.staged) return 'Analyzed staged changes'
  if (options.base) return `Compared current branch against ${options.base}`
  if (options.revision) return `Compared against ${options.revision}`
  return 'Analyzed local changes'
}

export function fileCountLabel(count: number): string {
  return `${count} changed file${count === 1 ? '' : 's'}`
}
