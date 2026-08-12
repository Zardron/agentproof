import fs from 'node:fs'
import path from 'node:path'
import type { Finding } from '../core/types.js'
import {
  BASELINE_FORMAT_VERSION,
  buildBaselineFile,
  DEFAULT_BASELINE_FILE,
  type BaselineEntry,
  type BaselineFile,
} from './fingerprint.js'

export function resolveBaselinePath(cwd: string, configuredPath?: string): string {
  const relative = configuredPath?.trim() || DEFAULT_BASELINE_FILE
  return path.isAbsolute(relative) ? relative : path.join(cwd, relative)
}

export function readBaselineFile(filePath: string): BaselineFile | null {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<BaselineFile>
  if (raw.version !== BASELINE_FORMAT_VERSION || !Array.isArray(raw.findings)) {
    throw new Error(
      `Unsupported AgentProof baseline in ${filePath}. Expected version ${BASELINE_FORMAT_VERSION}.`,
    )
  }
  const findings: BaselineEntry[] = raw.findings.map((entry) => ({
    fingerprint: String(entry.fingerprint),
    ruleId: String(entry.ruleId),
    file: String(entry.file ?? ''),
  }))
  return { version: BASELINE_FORMAT_VERSION, findings }
}

export function writeBaselineFile(filePath: string, findings: Finding[]): BaselineFile {
  const baseline = buildBaselineFile(findings)
  fs.writeFileSync(filePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')
  return baseline
}
