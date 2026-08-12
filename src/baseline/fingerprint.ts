import { createHash } from 'node:crypto'
import type { Finding } from '../core/types.js'

export const DEFAULT_BASELINE_FILE = '.agentproof-baseline.json'
export const BASELINE_FORMAT_VERSION = 1 as const

export interface BaselineEntry {
  fingerprint: string
  ruleId: string
  file: string
}

export interface BaselineFile {
  version: typeof BASELINE_FORMAT_VERSION
  findings: BaselineEntry[]
}

export function normalizeBaselinePath(file: string | undefined): string {
  if (!file) return ''
  return file.replace(/\\/g, '/').replace(/^\.\//, '')
}

/** Collapse whitespace so trivial message formatting does not create a new issue. */
export function normalizeBaselineMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim()
}

/**
 * Stable identity for a finding that ignores line numbers and evidence.
 * Evidence is omitted so secrets in snippets cannot land in the committed file.
 */
export function fingerprintFinding(finding: Pick<Finding, 'ruleId' | 'file' | 'message'>): string {
  const payload = [
    finding.ruleId,
    normalizeBaselinePath(finding.file),
    normalizeBaselineMessage(finding.message),
  ].join('\0')
  return createHash('sha256').update(payload).digest('hex').slice(0, 16)
}

export function toBaselineEntry(finding: Finding): BaselineEntry {
  return {
    fingerprint: fingerprintFinding(finding),
    ruleId: finding.ruleId,
    file: normalizeBaselinePath(finding.file),
  }
}

export function buildBaselineFile(findings: Finding[]): BaselineFile {
  const unique = new Map<string, BaselineEntry>()
  for (const finding of findings) {
    const entry = toBaselineEntry(finding)
    if (!unique.has(entry.fingerprint)) unique.set(entry.fingerprint, entry)
  }
  const sorted = [...unique.values()].sort((a, b) => {
    if (a.fingerprint !== b.fingerprint) return a.fingerprint.localeCompare(b.fingerprint)
    if (a.ruleId !== b.ruleId) return a.ruleId.localeCompare(b.ruleId)
    return a.file.localeCompare(b.file)
  })
  return { version: BASELINE_FORMAT_VERSION, findings: sorted }
}
