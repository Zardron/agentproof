import type { CheckResult } from '../core/types.js'

/** Tests are orchestrated by `runChecks`; this module exists for architecture clarity. */
export function summarizeTests(results: CheckResult[]): CheckResult | undefined {
  return results.find((r) => r.id === 'tests')
}
