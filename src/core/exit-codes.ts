export const EXIT_PASS = 0
export const EXIT_REVIEW = 0
export const EXIT_BLOCKED = 1
export const EXIT_ERROR = 2

export function exitCodeForMergeStatus(
  status: 'PASS' | 'REVIEW' | 'BLOCKED',
  ci: boolean,
): number {
  if (status === 'BLOCKED') return EXIT_BLOCKED
  if (status === 'REVIEW' && ci) return EXIT_PASS
  return EXIT_PASS
}
