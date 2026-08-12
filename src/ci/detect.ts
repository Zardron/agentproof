export type CiProvider = 'github' | 'gitlab' | 'other' | 'none'

export function detectCiProvider(): CiProvider {
  if (process.env.GITHUB_ACTIONS === 'true') return 'github'
  if (process.env.GITLAB_CI === 'true') return 'gitlab'
  if (process.env.CI === 'true') return 'other'
  return 'none'
}

export function isGithubActions(): boolean {
  return process.env.GITHUB_ACTIONS === 'true'
}
