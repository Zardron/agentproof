import path from 'node:path'
import { EXIT_PASS } from '../core/exit-codes.js'
import { runPipeline } from '../core/pipeline.js'
import type { CliOptions } from '../core/types.js'
import { DEFAULT_BASELINE_FILE } from './fingerprint.js'
import { resolveBaselinePath, writeBaselineFile } from './store.js'

export interface RecordBaselineOptions extends CliOptions {
  baselinePath?: string
}

export async function recordBaseline(options: RecordBaselineOptions): Promise<{
  path: string
  count: number
  output: string
  exitCode: number
}> {
  const { report } = await runPipeline({
    ...options,
    applyBaseline: false,
    json: true,
    sarif: false,
    html: undefined,
  })
  const filePath = resolveBaselinePath(options.cwd, options.baselinePath)
  const baseline = writeBaselineFile(filePath, report.findings)
  const relative = path.relative(options.cwd, filePath) || DEFAULT_BASELINE_FILE
  const output = [
    'AgentProof Baseline',
    '',
    `Recorded ${baseline.findings.length} accepted finding${baseline.findings.length === 1 ? '' : 's'} to ${relative.replace(/\\/g, '/')}`,
    '',
    'Future runs will distinguish existing, new, and resolved findings.',
    '',
  ].join('\n')
  return { path: filePath, count: baseline.findings.length, output, exitCode: EXIT_PASS }
}
