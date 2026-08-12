import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execaSync } from 'execa'

export const CACHE_DIR_NAME = '.agentproof-cache'
export const CACHEABLE_CHECK_IDS = ['typecheck', 'lint', 'tests', 'build'] as const

const CONFIG_FILES = [
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'tsconfig.json',
  'jsconfig.json',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yml',
  'biome.json',
  'biome.jsonc',
  'vitest.config.ts',
  'vitest.config.js',
  'vitest.config.mjs',
  'jest.config.ts',
  'jest.config.js',
  'jest.config.cjs',
  'playwright.config.ts',
  'agentproof.config.yaml',
  'agentproof.config.yml',
  'agentproof.config.json',
  'agentproof.config.ts',
  'agentproof.config.js',
]

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git', '.next', 'build', CACHE_DIR_NAME])

function sha256(parts: string[]): string {
  const hash = createHash('sha256')
  for (const part of parts) hash.update(part).update('\0')
  return hash.digest('hex')
}

function fileHash(abs: string): string {
  try {
    return createHash('sha256').update(fs.readFileSync(abs)).digest('hex')
  } catch {
    return ''
  }
}

function gitInputs(cwd: string): string[] {
  try {
    const inside = execaSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd,
      reject: false,
    })
    if (inside.exitCode !== 0 || inside.stdout.trim() !== 'true') return []
    const head = execaSync('git', ['rev-parse', 'HEAD'], { cwd, reject: false })
    const diff = execaSync('git', ['diff', 'HEAD'], { cwd, reject: false })
    const untracked = execaSync(
      'git',
      ['ls-files', '-o', '--exclude-standard'],
      { cwd, reject: false },
    )
    const parts = [
      `head:${head.exitCode === 0 ? head.stdout.trim() : ''}`,
      `diff:${diff.exitCode === 0 ? diff.stdout : ''}`,
    ]
    if (untracked.exitCode === 0) {
      for (const rel of untracked.stdout.split('\n').filter(Boolean).sort()) {
        parts.push(`untracked:${rel}:${fileHash(path.join(cwd, rel))}`)
      }
    }
    return parts
  } catch {
    return []
  }
}

function walkSourceHashes(cwd: string): string[] {
  const parts: string[] = []
  const walk = (dir: string) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        walk(abs)
        continue
      }
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name)
      if (!['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.json'].includes(ext)) {
        continue
      }
      const rel = path.relative(cwd, abs).split(path.sep).join('/')
      parts.push(`${rel}:${fileHash(abs)}`)
    }
  }
  walk(cwd)
  return parts.sort()
}

export function collectWorkspaceFingerprint(cwd: string): string {
  const parts = [
    `node:${process.version}`,
    `platform:${process.platform}`,
  ]
  for (const name of CONFIG_FILES) {
    const abs = path.join(cwd, name)
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      parts.push(`config:${name}:${fileHash(abs)}`)
    }
  }
  const git = gitInputs(cwd)
  if (git.length > 0) parts.push(...git)
  else parts.push(...walkSourceHashes(cwd))
  return sha256(parts)
}

export function checkCacheKey(options: {
  cwd: string
  checkId: string
  command: string | null
  workspaceFingerprint: string
}): string {
  return sha256([
    options.workspaceFingerprint,
    options.checkId,
    options.command ?? '',
  ])
}

export function isCacheableCheck(checkId: string): boolean {
  return (CACHEABLE_CHECK_IDS as readonly string[]).includes(checkId)
}
