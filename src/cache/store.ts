import fs from 'node:fs'
import path from 'node:path'
import type { CheckResult } from '../core/types.js'
import { CACHE_DIR_NAME, checkCacheKey, isCacheableCheck } from './fingerprint.js'

interface CacheRecord {
  key: string
  result: CheckResult
}

export function resolveCacheDir(cwd: string): string {
  return path.join(cwd, CACHE_DIR_NAME)
}

export function clearCheckCache(cwd: string): { dir: string; existed: boolean } {
  const dir = resolveCacheDir(cwd)
  const existed = fs.existsSync(dir)
  if (existed) fs.rmSync(dir, { recursive: true, force: true })
  return { dir, existed }
}

function recordPath(cacheDir: string, checkId: string): string {
  return path.join(cacheDir, `${checkId}.json`)
}

export function readCachedCheck(options: {
  cwd: string
  checkId: string
  command: string | null
  workspaceFingerprint: string
}): CheckResult | null {
  if (!isCacheableCheck(options.checkId)) return null
  const file = recordPath(resolveCacheDir(options.cwd), options.checkId)
  if (!fs.existsSync(file)) return null
  try {
    const record = JSON.parse(fs.readFileSync(file, 'utf8')) as CacheRecord
    const expected = checkCacheKey(options)
    if (record.key !== expected) return null
    if (record.result.status !== 'passed') return null
    return { ...record.result, cached: true, durationMs: undefined, summary: 'Passed (cached)' }
  } catch {
    return null
  }
}

export function writeCachedCheck(options: {
  cwd: string
  checkId: string
  command: string | null
  workspaceFingerprint: string
  result: CheckResult
}): void {
  if (!isCacheableCheck(options.checkId)) return
  if (options.result.status !== 'passed') return
  const dir = resolveCacheDir(options.cwd)
  fs.mkdirSync(dir, { recursive: true })
  const record: CacheRecord = {
    key: checkCacheKey(options),
    result: {
      id: options.result.id,
      title: options.result.title,
      status: 'passed',
      summary: 'Passed',
    },
  }
  fs.writeFileSync(recordPath(dir, options.checkId), `${JSON.stringify(record)}\n`, 'utf8')
}
