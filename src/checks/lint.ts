import type { CheckResult } from '../core/types.js'

/** Lint check is orchestrated by `runChecks`; this module exists for architecture clarity. */
export function summarizeLint(results: CheckResult[]): CheckResult | undefined {
  return results.find((r) => r.id === 'lint')
}
