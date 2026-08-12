import fs from 'node:fs'
import path from 'node:path'
import type { CheckResult, NormalizedDiff, ProjectModel } from '../core/types.js'

type DepMap = Record<string, string>

function readDeps(dir: string): {
  deps: DepMap
  scripts: Record<string, string>
} {
  const pkgPath = path.join(dir, 'package.json')
  if (!fs.existsSync(pkgPath)) return { deps: {}, scripts: {} }
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      dependencies?: DepMap
      devDependencies?: DepMap
      optionalDependencies?: DepMap
      scripts?: Record<string, string>
    }
    return {
      deps: {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.optionalDependencies,
      },
      scripts: pkg.scripts ?? {},
    }
  } catch {
    return { deps: {}, scripts: {} }
  }
}

function major(version: string): number | null {
  const cleaned = version.replace(/^[^\d]*/, '')
  const n = Number.parseInt(cleaned.split('.')[0] ?? '', 10)
  return Number.isFinite(n) ? n : null
}

function manifestDir(projectRoot: string, filePath: string): string {
  if (filePath === 'package.json') return projectRoot
  return path.join(projectRoot, path.dirname(filePath))
}

function packageJsonFiles(diff: NormalizedDiff) {
  return diff.files.filter(
    (f) => f.path === 'package.json' || f.path.endsWith('/package.json'),
  )
}

function analyzeManifest(
  projectRoot: string,
  pkgFile: NormalizedDiff['files'][number],
): {
  added: string[]
  removed: string[]
  majors: string[]
  risky: string[]
  lifecycleHits: string[]
  addedDetailed: Array<{ name: string; version: string }>
  majorsDetailed: Array<{ name: string; from: string; to: string }>
  riskyDetailed: Array<{ name: string; version: string }>
} {
  let baseDeps: DepMap = {}
  let baseScripts: Record<string, string> = {}
  try {
    const basePkg = JSON.parse(pkgFile.baseContent || '{}') as {
      dependencies?: DepMap
      devDependencies?: DepMap
      scripts?: Record<string, string>
    }
    baseDeps = { ...basePkg.dependencies, ...basePkg.devDependencies }
    baseScripts = basePkg.scripts ?? {}
  } catch {
    /* ignore */
  }

  const current = readDeps(manifestDir(projectRoot, pkgFile.path))
  const added: string[] = []
  const removed: string[] = []
  const majors: string[] = []
  const risky: string[] = []
  const addedDetailed: Array<{ name: string; version: string }> = []
  const majorsDetailed: Array<{ name: string; from: string; to: string }> = []
  const riskyDetailed: Array<{ name: string; version: string }> = []

  for (const [name, version] of Object.entries(current.deps)) {
    if (!(name in baseDeps)) {
      added.push(`${name}@${version}`)
      addedDetailed.push({ name, version })
    } else {
      const b = major(baseDeps[name]!)
      const c = major(version)
      if (b !== null && c !== null && c > b) {
        majors.push(`${name}: ${baseDeps[name]} → ${version}`)
        majorsDetailed.push({ name, from: baseDeps[name]!, to: version })
      }
    }
    if (/^(git\+|https?:\/\/.+\.git|github:)/.test(version) || /\.tgz$/.test(version)) {
      risky.push(`${name}@${version}`)
      riskyDetailed.push({ name, version })
    }
  }
  for (const name of Object.keys(baseDeps)) {
    if (!(name in current.deps)) removed.push(name)
  }

  const lifecycle = ['preinstall', 'install', 'postinstall', 'preuninstall', 'postuninstall']
  const lifecycleHits = lifecycle.filter(
    (s) => Boolean(current.scripts[s] && current.scripts[s] !== baseScripts[s]),
  )

  return {
    added,
    removed,
    majors,
    risky,
    lifecycleHits,
    addedDetailed,
    majorsDetailed,
    riskyDetailed,
  }
}

export async function runDependencyCheck(
  project: ProjectModel,
  diff: NormalizedDiff,
): Promise<CheckResult> {
  const manifests = packageJsonFiles(diff)
  const lockOnly = diff.files.some((f) =>
    /package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?/.test(f.path),
  )

  if (manifests.length === 0 && lockOnly) {
    return {
      id: 'dependencies',
      title: 'Dependencies',
      status: 'passed',
      summary: 'Lockfile-only changes (info)',
      details: 'No package.json dependency manifest changes detected.',
    }
  }

  if (manifests.length === 0) {
    return {
      id: 'dependencies',
      title: 'Dependencies',
      status: 'passed',
      summary: 'No dependency manifest changes',
    }
  }

  const added: string[] = []
  const removed: string[] = []
  const majors: string[] = []
  const risky: string[] = []
  const lifecycleHits: string[] = []

  for (const pkgFile of manifests) {
    const result = analyzeManifest(project.root, pkgFile)
    const label = pkgFile.path === 'package.json' ? 'root' : pkgFile.path
    added.push(...result.added.map((a) => (manifests.length > 1 ? `${label}: ${a}` : a)))
    removed.push(...result.removed.map((r) => (manifests.length > 1 ? `${label}: ${r}` : r)))
    majors.push(...result.majors.map((m) => (manifests.length > 1 ? `${label}: ${m}` : m)))
    risky.push(...result.risky.map((r) => (manifests.length > 1 ? `${label}: ${r}` : r)))
    lifecycleHits.push(
      ...result.lifecycleHits.map((s) => (manifests.length > 1 ? `${label}: ${s}` : s)),
    )
  }

  const parts = [
    added.length ? `added ${added.length}` : null,
    removed.length ? `removed ${removed.length}` : null,
    majors.length ? `major bumps ${majors.length}` : null,
    risky.length ? `git/tarball ${risky.length}` : null,
    lifecycleHits.length ? `lifecycle ${lifecycleHits.length}` : null,
  ].filter(Boolean)

  const warned = added.length + majors.length + risky.length + lifecycleHits.length > 0

  return {
    id: 'dependencies',
    title: 'Dependencies',
    status: warned ? 'warned' : 'passed',
    summary: parts.length ? parts.join(', ') : 'No notable dependency changes',
    details: [
      added.length ? `Added: ${added.join(', ')}` : null,
      removed.length ? `Removed: ${removed.join(', ')}` : null,
      majors.length ? `Majors: ${majors.join(', ')}` : null,
      risky.length ? `Risky sources: ${risky.join(', ')}` : null,
      lifecycleHits.length ? `Lifecycle scripts changed: ${lifecycleHits.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  }
}

export function dependencyFindingInputs(
  project: ProjectModel,
  diff: NormalizedDiff,
): {
  added: Array<{ name: string; version: string }>
  majors: Array<{ name: string; from: string; to: string }>
  risky: Array<{ name: string; version: string }>
  lifecycle: string[]
  packageJsonChanged: boolean
} {
  const manifests = packageJsonFiles(diff)
  if (manifests.length === 0) {
    return { added: [], majors: [], risky: [], lifecycle: [], packageJsonChanged: false }
  }

  const added: Array<{ name: string; version: string }> = []
  const majors: Array<{ name: string; from: string; to: string }> = []
  const risky: Array<{ name: string; version: string }> = []
  const lifecycle: string[] = []

  for (const pkgFile of manifests) {
    const result = analyzeManifest(project.root, pkgFile)
    added.push(...result.addedDetailed)
    majors.push(...result.majorsDetailed)
    risky.push(...result.riskyDetailed)
    lifecycle.push(...result.lifecycleHits)
  }

  return { added, majors, risky, lifecycle, packageJsonChanged: true }
}
