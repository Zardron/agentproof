import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { collectWorkspaceFingerprint } from '../../src/cache/fingerprint.js'
import { clearCheckCache, readCachedCheck, writeCachedCheck } from '../../src/cache/store.js'
import { runChecks } from '../../src/checks/runner.js'
import { detectProject } from '../../src/detect/project.js'
import { defaultPolicy } from '../../src/policy/schema.js'
import { parseArgs } from '../../src/cli/args.js'
import { messageForCheck } from '../../src/core/progress.js'
import type { NormalizedDiff } from '../../src/core/types.js'

function tempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-cache-'))
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'cache-demo',
      scripts: { typecheck: 'node -e "process.exit(0)"' },
    }),
  )
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}')
  fs.writeFileSync(path.join(dir, 'src.ts'), 'export const n = 1\n')
  return dir
}

const emptyDiff: NormalizedDiff = {
  baseRef: 'HEAD',
  headRef: 'WORKTREE',
  staged: false,
  files: [],
}

describe('cache fingerprint', () => {
  it('changes when source or tsconfig changes', () => {
    const dir = tempProject()
    const first = collectWorkspaceFingerprint(dir)
    fs.writeFileSync(path.join(dir, 'src.ts'), 'export const n = 2\n')
    const afterSource = collectWorkspaceFingerprint(dir)
    expect(afterSource).not.toBe(first)
    fs.writeFileSync(path.join(dir, 'src.ts'), 'export const n = 1\n')
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{ "include": ["src.ts"] }')
    expect(collectWorkspaceFingerprint(dir)).not.toBe(first)
  })

  it('changes when the lockfile or package.json changes', () => {
    const dir = tempProject()
    const first = collectWorkspaceFingerprint(dir)
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{"lockfileVersion": 3}')
    expect(collectWorkspaceFingerprint(dir)).not.toBe(first)
  })
})

describe('cache store', () => {
  it('returns a cached PASS only for the same key and never stores failures', () => {
    const dir = tempProject()
    const fingerprint = collectWorkspaceFingerprint(dir)
    writeCachedCheck({
      cwd: dir,
      checkId: 'typecheck',
      command: 'npm run typecheck',
      workspaceFingerprint: fingerprint,
      result: { id: 'typecheck', title: 'Typecheck', status: 'failed', summary: 'Failed' },
    })
    expect(
      readCachedCheck({
        cwd: dir,
        checkId: 'typecheck',
        command: 'npm run typecheck',
        workspaceFingerprint: fingerprint,
      }),
    ).toBeNull()

    writeCachedCheck({
      cwd: dir,
      checkId: 'typecheck',
      command: 'npm run typecheck',
      workspaceFingerprint: fingerprint,
      result: { id: 'typecheck', title: 'Typecheck', status: 'passed', summary: 'Passed' },
    })
    const hit = readCachedCheck({
      cwd: dir,
      checkId: 'typecheck',
      command: 'npm run typecheck',
      workspaceFingerprint: fingerprint,
    })
    expect(hit?.cached).toBe(true)
    expect(hit?.status).toBe('passed')
    expect(
      readCachedCheck({
        cwd: dir,
        checkId: 'typecheck',
        command: 'npm run typecheck',
        workspaceFingerprint: 'different',
      }),
    ).toBeNull()

    const cleared = clearCheckCache(dir)
    expect(cleared.existed).toBe(true)
    expect(
      readCachedCheck({
        cwd: dir,
        checkId: 'typecheck',
        command: 'npm run typecheck',
        workspaceFingerprint: fingerprint,
      }),
    ).toBeNull()
  })
})

describe('runChecks cache', () => {
  it('reuses a passed typecheck and invalidates after a source change', async () => {
    const dir = tempProject()
    const project = detectProject(dir)
    const first = await runChecks({
      project,
      policy: defaultPolicy,
      diff: emptyDiff,
      skipChecks: false,
    })
    const typecheck = first.find((c) => c.id === 'typecheck')
    expect(typecheck?.status).toBe('passed')
    expect(typecheck?.cached).toBeFalsy()

    const second = await runChecks({
      project,
      policy: defaultPolicy,
      diff: emptyDiff,
      skipChecks: false,
    })
    expect(second.find((c) => c.id === 'typecheck')?.cached).toBe(true)
    expect(messageForCheck('Typecheck', second.find((c) => c.id === 'typecheck')!)).toBe(
      'Typecheck passed (cached)',
    )

    fs.writeFileSync(path.join(dir, 'src.ts'), 'export const n = 3\n')
    const third = await runChecks({
      project: detectProject(dir),
      policy: defaultPolicy,
      diff: emptyDiff,
      skipChecks: false,
    })
    expect(third.find((c) => c.id === 'typecheck')?.cached).toBeFalsy()

    const forced = await runChecks({
      project: detectProject(dir),
      policy: defaultPolicy,
      diff: emptyDiff,
      skipChecks: false,
      noCache: true,
    })
    expect(forced.find((c) => c.id === 'typecheck')?.cached).toBeFalsy()
  })
})

describe('parseArgs cache', () => {
  it('parses --no-cache', () => {
    expect(parseArgs(['--no-cache']).noCache).toBe(true)
  })
})
