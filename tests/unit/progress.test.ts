import { describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runPipeline } from '../../src/core/pipeline.js'
import {
  eventFromCheck,
  fileCountLabel,
  formatDuration,
  messageForCheck,
} from '../../src/core/progress.js'
import type { CheckResult, ProgressEvent } from '../../src/core/types.js'
import {
  createProgressRenderer,
  formatCiLine,
  formatInteractiveDone,
  isInteractiveProgress,
} from '../../src/cli/progress-ui.js'
import { parseArgs } from '../../src/cli/args.js'
import { EXIT_ERROR, EXIT_PASS } from '../../src/core/exit-codes.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

function collectProgress() {
  const events: ProgressEvent[] = []
  return {
    events,
    onProgress: (event: ProgressEvent) => {
      events.push(event)
    },
  }
}

describe('progress helpers', () => {
  it('formats durations for expensive stages', () => {
    expect(formatDuration(3200)).toBe(' (3.2s)')
    expect(formatDuration(1800)).toBe(' (1.8s)')
    expect(formatDuration(400)).toBe(' (400ms)')
    expect(formatDuration(undefined)).toBe('')
  })

  it('maps check results to progress messages', () => {
    const passed: CheckResult = {
      id: 'typecheck',
      title: 'Typecheck',
      status: 'passed',
      summary: 'Passed',
      durationMs: 1200,
    }
    const failed: CheckResult = {
      id: 'lint',
      title: 'Lint',
      status: 'failed',
      summary: 'Failed (exit 1)',
    }
    const skipped: CheckResult = {
      id: 'tests',
      title: 'Tests',
      status: 'skipped',
      summary: 'Skipped (not configured)',
    }
    expect(messageForCheck('Typecheck', passed)).toBe('Typecheck passed')
    expect(messageForCheck('Lint', failed)).toBe('Lint failed')
    expect(messageForCheck('Tests', skipped)).toBe('Tests not configured')
    expect(eventFromCheck('typecheck', 'Typecheck', passed).status).toBe('passed')
    expect(fileCountLabel(1)).toBe('1 changed file')
    expect(fileCountLabel(24)).toBe('24 changed files')
  })
})

describe('progress renderer', () => {
  it('uses stable CI lines when not a TTY', () => {
    expect(
      isInteractiveProgress({
        ci: true,
        json: false,
        sarif: false,
        isTty: true,
      }),
    ).toBe(false)
    expect(
      isInteractiveProgress({
        ci: false,
        json: true,
        sarif: false,
        isTty: true,
      }),
    ).toBe(false)
    expect(
      isInteractiveProgress({
        ci: false,
        json: false,
        sarif: false,
        isTty: true,
        env: { CI: 'true' },
      }),
    ).toBe(false)
    expect(
      isInteractiveProgress({
        ci: false,
        json: false,
        sarif: false,
        isTty: true,
        env: {},
      }),
    ).toBe(true)
    expect(
      isInteractiveProgress({
        ci: false,
        json: false,
        sarif: false,
        isTty: false,
      }),
    ).toBe(false)
  })

  it('formats interactive and CI completion lines', () => {
    const passed: ProgressEvent = {
      stage: 'typecheck',
      status: 'passed',
      message: 'Typecheck passed',
      durationMs: 3200,
    }
    const failed: ProgressEvent = {
      stage: 'lint',
      status: 'failed',
      message: 'Lint failed',
    }
    const skipped: ProgressEvent = {
      stage: 'tests',
      status: 'skipped',
      message: 'Tests not configured',
    }
    expect(formatInteractiveDone(passed)).toContain('Typecheck passed (3.2s)')
    expect(formatInteractiveDone(failed)).toContain('Lint failed')
    expect(formatInteractiveDone(skipped)).toContain('Tests not configured')
    expect(formatCiLine({ stage: 'detect', status: 'running', message: 'Detecting project...' })).toBe(
      '[AgentProof] Detecting project...',
    )
    expect(formatCiLine(passed)).toBe('[AgentProof] Typecheck passed (3.2s)')
  })

  it('writes CI progress without spinner frames and stop() is idempotent', () => {
    let written = ''
    const renderer = createProgressRenderer({
      interactive: false,
      stream: { write: (chunk: string) => { written += chunk; return true } } as NodeJS.WritableStream,
    })
    renderer.header('0.4.0')
    renderer.handle({ stage: 'detect', status: 'running', message: 'Detecting project...' })
    renderer.handle({
      stage: 'detect',
      status: 'completed',
      message: 'Detected Node.js + TypeScript + npm',
    })
    renderer.stop()
    renderer.stop()
    expect(written).toContain('[AgentProof] AgentProof 0.4.0')
    expect(written).toContain('[AgentProof] Detecting project...')
    expect(written).toContain('[AgentProof] Detected Node.js + TypeScript + npm')
    expect(written).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/)
  })

  it('prints the failed stage and underlying error', () => {
    let written = ''
    const renderer = createProgressRenderer({
      interactive: false,
      stream: { write: (chunk: string) => { written += chunk; return true } } as NodeJS.WritableStream,
    })
    renderer.fail('diff', new Error('not a git repository'))
    expect(written).toContain('[AgentProof] Failed while generating Git diff')
    expect(written).toContain('not a git repository')
  })
})

describe('pipeline progress events', () => {
  it('emits real stages for skip-checks without changing merge exit codes', async () => {
    const { events, onProgress } = collectProgress()
    const { report, exitCode, output } = await runPipeline({
      cwd: root,
      staged: false,
      json: true,
      sarif: false,
      ci: false,
      skipChecks: true,
      onProgress,
    })
    const stages = events.map((e) => `${e.stage}:${e.status}`)
    expect(stages[0]).toBe('config:running')
    expect(events.some((e) => e.stage === 'detect' && e.status === 'completed')).toBe(true)
    expect(events.some((e) => e.stage === 'diff' && e.status === 'completed')).toBe(true)
    expect(events.some((e) => e.stage === 'typecheck' && e.status === 'skipped')).toBe(true)
    expect(events.some((e) => e.stage === 'lint' && e.status === 'skipped')).toBe(true)
    expect(events.some((e) => e.stage === 'tests' && e.status === 'skipped')).toBe(true)
    expect(events.some((e) => e.stage === 'build' && e.status === 'skipped')).toBe(true)
    expect(events.some((e) => e.stage === 'security' && e.status === 'completed')).toBe(true)
    expect(events.some((e) => e.stage === 'risk' && e.status === 'completed')).toBe(true)
    expect(events.some((e) => e.stage === 'report' && e.status === 'completed')).toBe(true)
    expect(report.mergeStatus).toMatch(/PASS|REVIEW|BLOCKED/)
    expect(exitCode).toBe(EXIT_PASS)
    expect(() => JSON.parse(output)).not.toThrow()
    expect(output).not.toContain('[AgentProof]')
    expect(output).not.toContain('Detecting project')
  })

  it('keeps SARIF stdout parseable when progress is collected separately', async () => {
    const { events, onProgress } = collectProgress()
    const { output, exitCode } = await runPipeline({
      cwd: root,
      staged: false,
      json: false,
      sarif: true,
      ci: false,
      skipChecks: true,
      onProgress,
    })
    const parsed = JSON.parse(output) as { version: string; runs: unknown[] }
    expect(parsed.version).toBe('2.1.0')
    expect(Array.isArray(parsed.runs)).toBe(true)
    expect(events.length).toBeGreaterThan(0)
    expect(exitCode).toBe(EXIT_PASS)
    expect(output.startsWith('{')).toBe(true)
  })

  it('emits HTML written progress and still returns a terminal report', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-html-'))
    const htmlPath = path.join(dir, 'agentproof-report.html')
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
    const { events, onProgress } = collectProgress()
    const { output, exitCode } = await runPipeline({
      cwd: dir,
      staged: false,
      json: false,
      sarif: false,
      ci: false,
      skipChecks: true,
      html: htmlPath,
      onProgress,
    })
    expect(fs.existsSync(htmlPath)).toBe(true)
    expect(events.some((e) => e.stage === 'html' && e.message.includes('HTML report written'))).toBe(
      true,
    )
    expect(output).toContain('MERGE STATUS')
    expect(exitCode).toBe(EXIT_PASS)
  })

  it('emits a failed stage for unexpected pipeline errors', async () => {
    const { events, onProgress } = collectProgress()
    await expect(
      runPipeline({
        cwd: root,
        staged: false,
        json: true,
        sarif: false,
        ci: false,
        skipChecks: true,
        configPath: path.join(root, 'does-not-exist.agentproof.yaml'),
        onProgress,
      }),
    ).rejects.toThrow()
    expect(events.some((e) => e.stage === 'config' && e.status === 'failed')).toBe(true)
    expect(events.find((e) => e.status === 'failed')?.message).toContain('loading configuration')
  })

  it('attributes HTML write failures to the html stage', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-html-fail-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
    const { events, onProgress } = collectProgress()
    await expect(
      runPipeline({
        cwd: dir,
        staged: false,
        json: true,
        sarif: false,
        ci: false,
        skipChecks: true,
        html: dir,
        onProgress,
      }),
    ).rejects.toThrow()
    const failed = events.filter((e) => e.status === 'failed')
    expect(failed.at(-1)?.stage).toBe('html')
    expect(failed.at(-1)?.message).toContain('writing HTML report')
  })

  it('does not treat BLOCKED-without-ci as a process failure', async () => {
    const { exitCode } = await runPipeline({
      cwd: root,
      staged: false,
      json: true,
      sarif: false,
      ci: false,
      skipChecks: true,
    })
    expect(exitCode).not.toBe(EXIT_ERROR)
  })
})

describe('parseArgs verbose', () => {
  it('parses --verbose', () => {
    expect(parseArgs(['--verbose', '--skip-checks']).verbose).toBe(true)
  })
})
