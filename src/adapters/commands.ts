import type { ProjectModel } from '../core/types.js'
import fs from 'node:fs'
import path from 'node:path'

function runScript(pm: ProjectModel['packageManager'], script: string): string {
  if (pm === 'npm') return `npm run ${script}`
  if (pm === 'yarn') return `yarn ${script}`
  if (pm === 'bun') return `bun run ${script}`
  return `pnpm ${script}`
}

export function resolveTypecheckCommand(project: ProjectModel): string | null {
  if (project.language === 'javascript') return null
  const hasTsconfig = fs.existsSync(path.join(project.root, 'tsconfig.json'))
  if (project.packageJsonScripts.typecheck) {
    return runScript(project.packageManager, 'typecheck')
  }
  if (project.packageJsonScripts.tsc) {
    return runScript(project.packageManager, 'tsc')
  }
  if (!hasTsconfig) return null
  return 'npx tsc --noEmit -p tsconfig.json'
}

export function resolveBuildCommand(project: ProjectModel): string | null {
  return project.build.command
}

export function resolveTestCommand(project: ProjectModel): string | null {
  return project.test.command
}

export function resolveLintCommand(project: ProjectModel): string | null {
  return project.lint.command
}
