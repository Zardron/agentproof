import fs from 'node:fs'
import path from 'node:path'
import type { ProjectModel } from '../core/types.js'
import type { WorkspacePackage } from './monorepo.js'
import { packageFilterCommand } from './monorepo.js'

function readPackageJson(dir: string): Record<string, unknown> {
  const pkgPath = path.join(dir, 'package.json')
  if (!fs.existsSync(pkgPath)) return {}
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

function packageScripts(dir: string): Record<string, string> {
  const pkg = readPackageJson(dir)
  return (pkg.scripts as Record<string, string> | undefined) ?? {}
}

export function resolveWorkspaceTypecheck(
  rootProject: ProjectModel,
  pkg: WorkspacePackage,
): string | null {
  const scripts = packageScripts(pkg.dir)
  const pm = rootProject.packageManager
  if (scripts.typecheck) return packageFilterCommand(pm, 'typecheck', pkg.name)
  if (scripts.tsc) return packageFilterCommand(pm, 'tsc', pkg.name)
  if (!fs.existsSync(path.join(pkg.dir, 'tsconfig.json'))) return null
  return `npx tsc --noEmit -p ${JSON.stringify(path.join(pkg.relativeDir, 'tsconfig.json'))}`
}

export function resolveWorkspaceScript(
  rootProject: ProjectModel,
  pkg: WorkspacePackage,
  script: 'build' | 'test' | 'lint',
): string | null {
  const scripts = packageScripts(pkg.dir)
  if (!scripts[script]) return null
  return packageFilterCommand(rootProject.packageManager, script, pkg.name)
}

export function packageHasScript(pkg: WorkspacePackage, script: string): boolean {
  return Boolean(packageScripts(pkg.dir)[script])
}
