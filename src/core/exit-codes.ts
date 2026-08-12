export const EXIT_PASS = 0
export const EXIT_REVIEW = 0
export const EXIT_BLOCKED = 1
export const EXIT_ERROR = 2

export function exitCodeForMergeStatus(
  status: 'PASS' | 'REVIEW' | 'BLOCKED',
  ci: boolean,
): number {
  // Local runs report BLOCKED without failing the process; --ci opts into exit 1.
  if (status === 'BLOCKED' && ci) return EXIT_BLOCKED
  return EXIT_PASS
}
