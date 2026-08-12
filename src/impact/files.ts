import fs from 'node:fs'
import path from 'node:path'
import { isTestPath } from '../git/classify.js'

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git', '.next', 'build'])

export function posixPath(filePath: string): string {
  return filePath.split(path.sep).join('/')
}

export function isSourceFile(filePath: string): boolean {
  const ext = path.extname(filePath)
  if (!SOURCE_EXT.has(ext)) return false
  const base = path.basename(filePath)
  if (base.endsWith('.d.ts')) return false
  return !isTestPath(filePath)
}

export function listProjectFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env') continue
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        walk(path.join(dir, entry.name))
        continue
      }
      if (!entry.isFile()) continue
      const abs = path.join(dir, entry.name)
      const rel = posixPath(path.relative(root, abs))
      const ext = path.extname(entry.name)
      if (SOURCE_EXT.has(ext) || isTestPath(rel)) out.push(rel)
    }
  }
  walk(root)
  return out.sort()
}

const RESOLVE_TRIES = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.mjs',
]

export function resolveRelativeImport(
  fromFile: string,
  specifier: string,
  files: Set<string>,
): string | null {
  if (!specifier.startsWith('.')) return null
  const fromDir = posixPath(path.posix.dirname(fromFile))
  const joined = posixPath(path.posix.normalize(`${fromDir}/${specifier}`))
  for (const suffix of RESOLVE_TRIES) {
    const candidate = posixPath(joined + suffix).replace(/^\.\//, '')
    if (files.has(candidate)) return candidate
  }
  return null
}

export function readFile(root: string, relativePath: string): string {
  try {
    return fs.readFileSync(path.join(root, relativePath), 'utf8')
  } catch {
    return ''
  }
}
