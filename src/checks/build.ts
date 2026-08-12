import type { CheckResult } from '../core/types.js'

/** Build is orchestrated by `runChecks`; this module exists for architecture clarity. */
export function summarizeBuild(results: CheckResult[]): CheckResult | undefined {
  return results.find((r) => r.id === 'build')
}
