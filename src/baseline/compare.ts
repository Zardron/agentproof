import type { Finding } from '../core/types.js'
import { fingerprintFinding, type BaselineEntry, type BaselineFile } from './fingerprint.js'

export type BaselineStatus = 'new' | 'existing'

export interface BaselineComparison {
  path: string
  existing: number
  new: number
  resolved: number
  resolvedEntries: BaselineEntry[]
}

export function compareToBaseline(
  findings: Finding[],
  baseline: BaselineFile,
  baselinePath: string,
): { findings: Finding[]; comparison: BaselineComparison } {
  const baselineFingerprints = new Set(baseline.findings.map((entry) => entry.fingerprint))
  const currentFingerprints = new Set(findings.map((finding) => fingerprintFinding(finding)))

  const annotated = findings.map((finding) => ({
    ...finding,
    baselineStatus: baselineFingerprints.has(fingerprintFinding(finding))
      ? ('existing' as const)
      : ('new' as const),
  }))

  const resolvedEntries = baseline.findings.filter(
    (entry) => !currentFingerprints.has(entry.fingerprint),
  )

  return {
    findings: annotated,
    comparison: {
      path: baselinePath,
      existing: annotated.filter((finding) => finding.baselineStatus === 'existing').length,
      new: annotated.filter((finding) => finding.baselineStatus === 'new').length,
      resolved: resolvedEntries.length,
      resolvedEntries,
    },
  }
}

export function findingsForMergeDecision(findings: Finding[]): Finding[] {
  return findings.filter((finding) => finding.baselineStatus !== 'existing')
}
