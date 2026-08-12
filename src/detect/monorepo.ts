import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import type { NormalizedDiff, PackageManager, ProjectModel } from '../core/types.js'
import { runWithPm } from './package-manager.js'

export interface WorkspacePackage {
  name: string
  dir: string
  relativeDir: string
}

function readJson(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

function workspaceGlobs(root: string): string[] {
  const pnpmWs = path.join(root, 'pnpm-workspace.yaml')
  if (fs.existsSync(pnpmWs)) {
    try {
      const data = yaml.load(fs.readFileSync(pnpmWs, 'utf8')) as { packages?: string[] }
      if (Array.isArray(data?.packages)) return data.packages
    } catch {
      /* ignore */
    }
  }
  const pkg = readJson(path.join(root, 'package.json'))
  if (Array.isArray(pkg.workspaces)) return pkg.workspaces as string[]
  if (pkg.workspaces && typeof pkg.workspaces === 'object' && Array.isArray((pkg.workspaces as { packages?: string[] }).packages)) {
    return (pkg.workspaces as { packages: string[] }).packages
  }
  return []
}

function expandGlob(root: string, glob: string): string[] {
  const cleaned = glob.replace(/\/\*$/, '/*').replace(/^\.\//, '')
  if (cleaned.endsWith('/*')) {
    const parent = path.join(root, cleaned.slice(0, -2))
    if (!fs.existsSync(parent)) return []
    return fs
      .readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(parent, entry.name))
  }
  const exact = path.join(root, cleaned)
  return fs.existsSync(exact) ? [exact] : []
}

export function listWorkspacePackages(root: string): WorkspacePackage[] {
  const globs = workspaceGlobs(root)
  const out: WorkspacePackage[] = []
  for (const glob of globs) {
    for (const dir of expandGlob(root, glob)) {
      const pkgPath = path.join(dir, 'package.json')
      if (!fs.existsSync(pkgPath)) continue
      const pkg = readJson(pkgPath)
      const relativeDir = path.relative(root, dir).split(path.sep).join('/')
      out.push({
        name: typeof pkg.name === 'string' ? pkg.name : relativeDir,
        dir,
        relativeDir,
      })
    }
  }
  return out
}

/** Fallback for Nx/Turbo repos that omit npm/pnpm workspace globs. */
function listLayoutPackages(root: string): WorkspacePackage[] {
  const out: WorkspacePackage[] = []
  for (const parent of ['apps', 'packages', 'libs']) {
    const parentDir = path.join(root, parent)
    if (!fs.existsSync(parentDir)) continue
    for (const entry of fs.readdirSync(parentDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = path.join(parentDir, entry.name)
      const pkgPath = path.join(dir, 'package.json')
      if (!fs.existsSync(pkgPath)) continue
      const pkg = readJson(pkgPath)
      const relativeDir = path.relative(root, dir).split(path.sep).join('/')
      out.push({
        name: typeof pkg.name === 'string' ? pkg.name : relativeDir,
        dir,
        relativeDir,
      })
    }
  }
  return out
}

function inferWorkspaceKind(
  root: string,
  files: Set<string>,
): Exclude<ProjectModel['monorepo']['kind'], 'none' | 'nx' | 'turbo'> {
  if (files.has('pnpm-workspace.yaml') || files.has('pnpm-lock.yaml')) return 'pnpm'
  if (files.has('yarn.lock')) return 'yarn'
  if (files.has('bun.lock') || files.has('bun.lockb')) return 'bun'
  if (fs.existsSync(path.join(root, 'package-lock.json'))) return 'npm'
  return 'npm'
}

export function detectMonorepo(root: string, files: Set<string>): ProjectModel['monorepo'] {
  let packages = listWorkspacePackages(root)
  if (
    packages.length === 0 &&
    (files.has('nx.json') || files.has('turbo.json'))
  ) {
    packages = listLayoutPackages(root)
  }

  const packageList = packages.map((p) => p.relativeDir)

  // Tooling markers win for labeling; package discovery still uses workspace globs / layout.
  if (files.has('nx.json')) {
    return { kind: 'nx', packages: packageList }
  }
  if (files.has('turbo.json')) {
    return { kind: 'turbo', packages: packageList }
  }
  if (files.has('pnpm-workspace.yaml')) {
    return { kind: 'pnpm', packages: packageList }
  }
  if (packageList.length > 0) {
    return { kind: inferWorkspaceKind(root, files), packages: packageList }
  }
  return { kind: 'none', packages: [] }
}

export function affectedPackages(
  diff: NormalizedDiff,
  packages: WorkspacePackage[],
): WorkspacePackage[] {
  if (packages.length === 0) return []
  return packages.filter((pkg) =>
    diff.files.some(
      (file) =>
        file.path === pkg.relativeDir ||
        file.path.startsWith(`${pkg.relativeDir}/`),
    ),
  )
}

export function packageFilterCommand(
  pm: PackageManager,
  script: string,
  pkgName: string,
): string {
  const quoted = /[@\s!]/.test(pkgName) ? JSON.stringify(pkgName) : pkgName
  if (pm === 'pnpm') return `pnpm --filter ${quoted} ${script}`
  if (pm === 'yarn') return `yarn workspace ${quoted} ${script}`
  if (pm === 'bun') return `bun run --filter ${quoted} ${script}`
  return runWithPm(pm, `run ${script} -w ${quoted}`)
}
