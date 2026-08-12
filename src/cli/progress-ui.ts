import chalk from 'chalk'
import type { ProgressEvent, ProgressStatus } from '../core/progress.js'
import { formatDuration, STAGE_FAILURE_LABEL } from '../core/progress.js'
import type { ProgressStage } from '../core/progress.js'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const
const CLEAR_LINE = '\r\x1b[K'
const HIDE_CURSOR = '\x1b[?25l'
const SHOW_CURSOR = '\x1b[?25h'

export function isInteractiveProgress(options: {
  ci: boolean
  json: boolean
  sarif: boolean
  isTty: boolean
  env?: NodeJS.ProcessEnv
}): boolean {
  if (options.ci || options.json || options.sarif) return false
  const env = options.env ?? process.env
  if (env.CI === 'true' || env.GITHUB_ACTIONS === 'true') return false
  return options.isTty
}

function icon(status: ProgressStatus): string {
  if (status === 'passed' || status === 'completed') return chalk.green('✓')
  if (status === 'failed') return chalk.red('✗')
  if (status === 'warning') return chalk.yellow('⚠')
  if (status === 'skipped') return chalk.gray('-')
  return chalk.gray('·')
}

export function formatInteractiveDone(event: ProgressEvent): string {
  const duration =
    event.status === 'passed' ||
    event.status === 'failed' ||
    event.status === 'warning' ||
    event.status === 'completed'
      ? formatDuration(event.durationMs)
      : ''
  const lines = [`${icon(event.status)} ${event.message}${duration}`]
  if (event.detail) lines.push(`  ${event.detail}`)
  return lines.join('\n')
}

export function formatCiLine(event: ProgressEvent): string {
  const duration =
    event.status !== 'running' &&
    (event.status === 'passed' ||
      event.status === 'failed' ||
      event.status === 'warning' ||
      event.status === 'completed')
      ? formatDuration(event.durationMs)
      : ''
  const lines = [`[AgentProof] ${event.message}${duration}`]
  if (event.status !== 'running' && event.detail) {
    lines.push(`[AgentProof] ${event.detail}`)
  }
  return lines.join('\n')
}

export interface ProgressRenderer {
  header(version: string): void
  handle(event: ProgressEvent): void
  fail(stage: ProgressStage, err: unknown): void
  stop(): void
}

export function createProgressRenderer(options: {
  interactive: boolean
  stream: NodeJS.WritableStream
  enabled?: boolean
}): ProgressRenderer {
  const enabled = options.enabled !== false
  const stream = options.stream
  let timer: ReturnType<typeof setInterval> | null = null
  let frame = 0
  let spinning = false
  let generation = 0
  let currentMessage = ''

  const write = (text: string) => {
    stream.write(text.endsWith('\n') ? text : `${text}\n`)
  }

  const clearSpinner = () => {
    generation += 1
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    if (spinning && options.interactive) {
      stream.write(`${CLEAR_LINE}${SHOW_CURSOR}`)
    }
    spinning = false
    currentMessage = ''
  }

  const startSpinner = (message: string) => {
    clearSpinner()
    currentMessage = message
    if (!options.interactive) {
      write(`[AgentProof] ${message}`)
      return
    }
    spinning = true
    frame = 0
    const myGeneration = generation
    stream.write(HIDE_CURSOR)
    const tick = () => {
      if (myGeneration !== generation) return
      const glyph = SPINNER_FRAMES[frame % SPINNER_FRAMES.length]
      stream.write(`${CLEAR_LINE}${chalk.cyan(glyph)} ${currentMessage}`)
      frame += 1
    }
    tick()
    timer = setInterval(tick, 80)
    timer.unref?.()
  }

  return {
    header(version: string) {
      if (!enabled) return
      if (options.interactive) {
        write(chalk.bold(`AgentProof ${version}`))
        write('────────────────────────────')
        write('')
      } else {
        write(`[AgentProof] AgentProof ${version}`)
      }
    },
    handle(event: ProgressEvent) {
      if (!enabled) return
      if (event.status === 'running') {
        startSpinner(event.message)
        return
      }
      clearSpinner()
      if (options.interactive) {
        write(formatInteractiveDone(event))
        if (event.stage === 'diff') write('')
      } else {
        write(formatCiLine(event))
      }
    },
    fail(stage: ProgressStage, err: unknown) {
      if (!enabled) return
      clearSpinner()
      const label = STAGE_FAILURE_LABEL[stage]
      const message = err instanceof Error ? err.message : 'AgentProof failed with an unexpected error'
      if (options.interactive) {
        write(`${chalk.red('✗')} Failed while ${label}`)
        write(`  ${message}`)
      } else {
        write(`[AgentProof] Failed while ${label}`)
        write(`[AgentProof] ${message}`)
      }
    },
    stop() {
      clearSpinner()
    },
  }
}

export function attachProgressCleanup(
  renderer: ProgressRenderer,
  processRef: Pick<NodeJS.Process, 'on' | 'off' | 'exit'> = process,
): () => void {
  const onSigint = () => {
    renderer.stop()
    processRef.exit(130)
  }
  const onExit = () => {
    renderer.stop()
  }
  processRef.on('SIGINT', onSigint)
  processRef.on('exit', onExit)
  return () => {
    renderer.stop()
    processRef.off('SIGINT', onSigint)
    processRef.off('exit', onExit)
  }
}
