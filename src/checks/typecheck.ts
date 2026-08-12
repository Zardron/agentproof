import type { CheckResult } from '../core/types.js'

/** Typecheck is orchestrated by `runChecks`; this module exists for architecture clarity. */
export function summarizeTypecheck(results: CheckResult[]): CheckResult | undefined {
  return results.find((r) => r.id === 'typecheck')
}
