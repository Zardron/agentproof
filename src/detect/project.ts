import fs from 'node:fs'
import path from 'node:path'
import type { ProjectModel } from '../core/types.js'
import { detectCiProvider } from '../ci/detect.js'
import {
  collectEnvPrefixes,
  detectFrameworks,
  suggestBuildFromAdapters,
} from './frameworks/index.js'
import { detectMonorepo } from './monorepo.js'
import { detectPackageManager, runWithPm } from './package-manager.js'

function listTopFiles(root: string): Set<string> {
  const out = new Set<string>()
  try {
    for (const entry of fs.readdirSync(root)) out.add(entry)
  } catch {
    /* ignore */
  }
  return out
}

function readPackageJson(root: string): Record<string, unknown> {
  const p = path.join(root, 'package.json')
  if (!fs.existsSync(p)) return {}
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

function detectLanguage(root: string, files: Set<string>): ProjectModel['language'] {
  const hasTsConfig =
    files.has('tsconfig.json') ||
    fs.existsSync(path.join(root, 'tsconfig.json'))
  const hasJsConfig = files.has('jsconfig.json')

  // Prefer filesystem signals over package.json "main", which is common in TS packages.
  if (hasTsConfig && hasJsConfig) return 'mixed'
  if (hasTsConfig) return 'typescript'
  if (hasJsConfig) return 'javascript'
  return 'javascript'
}

function detectOrm(pkg: Record<string, unknown>, files: Set<string>): ProjectModel['orm'] {
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  }
  if (deps.prisma || deps['@prisma/client'] || files.has('prisma')) return 'prisma'
  if (deps['drizzle-orm']) return 'drizzle'
  if (deps.typeorm) return 'typeorm'
  return 'none'
}

function detectMonorepoShape(root: string, files: Set<string>): ProjectModel['monorepo'] {
  return detectMonorepo(root, files)
}

function detectTest(
  pkg: Record<string, unknown>,
  pm: ProjectModel['packageManager'],
): ProjectModel['test'] {
  const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {}
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  }
  let runner: ProjectModel['test']['runner'] = null
  if (deps.vitest || scripts.test?.includes('vitest')) runner = 'vitest'
  else if (deps.jest || scripts.test?.includes('jest')) runner = 'jest'
  else if (scripts.test?.includes('node --test') || deps['node:test']) runner = 'node'
  else if (scripts.test) runner = 'unknown'

  if (scripts.test) {
    return { command: runWithPm(pm, 'test'), runner }
  }
  return { command: null, runner }
}

function detectLint(
  pkg: Record<string, unknown>,
  files: Set<string>,
  pm: ProjectModel['packageManager'],
): ProjectModel['lint'] {
  const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {}
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  }
  if (deps['@biomejs/biome'] || files.has('biome.json')) {
    return {
      command: scripts.lint ? runWithPm(pm, 'run lint') : 'npx @biomejs/biome check .',
      tool: 'biome',
    }
  }
  if (
    deps.eslint ||
    files.has('.eslintrc.js') ||
    files.has('.eslintrc.cjs') ||
    files.has('eslint.config.js') ||
    files.has('eslint.config.mjs')
  ) {
    return {
      command: scripts.lint ? runWithPm(pm, 'run lint') : 'npx eslint .',
      tool: 'eslint',
    }
  }
  if (scripts.lint) {
    return { command: runWithPm(pm, 'run lint'), tool: 'eslint' }
  }
  return { command: null, tool: null }
}

function detectBuild(
  root: string,
  pkg: Record<string, unknown>,
  frameworks: ProjectModel['frameworks'],
  pm: ProjectModel['packageManager'],
): ProjectModel['build'] {
  const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {}
  const suggested = suggestBuildFromAdapters(frameworks, scripts)
  if (suggested) {
    return {
      command: runWithPm(pm, `run ${suggested.command}`),
      tool: suggested.tool,
    }
  }
  if (fs.existsSync(path.join(root, 'tsconfig.json'))) {
    return { command: 'npx tsc -p tsconfig.json', tool: 'typescript' }
  }
  return { command: null, tool: null }
}

export function detectProject(root: string): ProjectModel {
  const files = listTopFiles(root)
  const pkg = readPackageJson(root)
  const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {}
  const pm = detectPackageManager(root)
  const frameworks = detectFrameworks(pkg, files)
  const language = detectLanguage(root, files)

  const build = detectBuild(root, pkg, frameworks, pm)
  // Prefer explicit build script; otherwise leave TypeScript fallback from detectBuild.
  if (!scripts.build && language === 'typescript' && fs.existsSync(path.join(root, 'tsconfig.json'))) {
    build.command = 'npx tsc -p tsconfig.json'
    build.tool = 'typescript'
  }

  return {
    root,
    runtime: 'node',
    language,
    packageManager: pm,
    frameworks,
    build,
    test: detectTest(pkg, pm),
    lint: detectLint(pkg, files, pm),
    orm: detectOrm(pkg, files),
    monorepo: detectMonorepoShape(root, files),
    ci: { provider: detectCiProvider() },
    envPrefixes: collectEnvPrefixes(frameworks),
    packageJsonScripts: scripts,
  }
}
