import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseRelativeImports } from '../../src/impact/imports.js'
import { analyzeTestImpact, formatAffectedTests } from '../../src/impact/analyze.js'
import { defaultPolicy } from '../../src/policy/schema.js'
import { parseArgs } from '../../src/cli/args.js'
import type { DiffFile, NormalizedDiff } from '../../src/core/types.js'

function write(dir: string, rel: string, contents: string) {
  const abs = path.join(dir, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, contents)
}

function diffFor(dir: string, files: string[]): NormalizedDiff {
  return {
    baseRef: 'HEAD',
    headRef: 'WORKTREE',
    staged: false,
    files: files.map(
      (rel): DiffFile => ({
        path: rel,
        status: 'M',
        language: 'typescript',
        riskDomains: rel.includes('payment') || rel.includes('auth')
          ? ['payments']
          : ['other'],
        hunks: [],
        baseContent: '',
        currentContent: fs.readFileSync(path.join(dir, rel), 'utf8'),
      }),
    ),
  }
}

describe('import parsing', () => {
  it('collects relative imports only', () => {
    const src = `
      import { x } from './pricing'
      import type { Y } from '../auth/session'
      export { z } from './checkout'
      const k = require('./local')
      import fs from 'node:fs'
      import stripe from 'stripe'
    `
    expect(parseRelativeImports(src).sort()).toEqual([
      '../auth/session',
      './checkout',
      './local',
      './pricing',
    ])
  })
})

describe('test impact analysis', () => {
  it('links tests by import and naming, and flags critical files without tests', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-impact-'))
    write(dir, 'src/lib/pricing.ts', 'export const price = 1\n')
    write(dir, 'src/lib/checkout.ts', "import { price } from './pricing'\nexport const c = price\n")
    write(dir, 'src/lib/payment.ts', 'export const charge = 1\n')
    write(dir, 'src/lib/auth/session.ts', 'export const session = 1\n')
    write(
      dir,
      'tests/pricing.test.ts',
      "import { price } from '../src/lib/pricing'\nexpect(price).toBe(1)\n",
    )
    write(dir, 'src/lib/checkout.test.ts', "import { c } from './checkout'\n")
    write(dir, 'src/lib/util.ts', 'export const util = 1\n')
    write(dir, 'tests/util.test.ts', 'test("placeholder", () => undefined)\n')

    const report = analyzeTestImpact({
      cwd: dir,
      diff: diffFor(dir, [
        'src/lib/pricing.ts',
        'src/lib/checkout.ts',
        'src/lib/payment.ts',
        'src/lib/auth/session.ts',
        'src/lib/util.ts',
      ]),
      policy: {
        ...defaultPolicy,
        protected_areas: ['src/lib/auth/**'],
      },
    })

    expect(report.changedSourceFiles).toEqual([
      'src/lib/auth/session.ts',
      'src/lib/checkout.ts',
      'src/lib/payment.ts',
      'src/lib/pricing.ts',
      'src/lib/util.ts',
    ])
    expect(report.affectedModules).toContain('src/lib/pricing.ts')
    expect(report.relatedTests.find((row) => row.source === 'src/lib/pricing.ts')?.tests).toContain(
      'tests/pricing.test.ts',
    )
    expect(report.relatedTests.find((row) => row.source === 'src/lib/checkout.ts')?.tests).toContain(
      'src/lib/checkout.test.ts',
    )
    expect(report.relatedTests.find((row) => row.source === 'src/lib/util.ts')).toEqual({
      source: 'src/lib/util.ts',
      tests: ['tests/util.test.ts'],
      confidence: 'naming',
    })
    expect(report.untested.map((row) => row.source).sort()).toEqual([
      'src/lib/auth/session.ts',
      'src/lib/payment.ts',
    ])
    expect(report.untested.find((row) => row.source === 'src/lib/payment.ts')?.critical).toBe(true)
    expect(formatAffectedTests(report)).toContain('tests/pricing.test.ts')
    expect(formatAffectedTests(report)).toContain('src/lib/checkout.test.ts')
  })

  it('does not invent tests from package names', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-impact-pkg-'))
    write(dir, 'src/pay.ts', "import Stripe from 'stripe'\nexport const s = Stripe\n")
    write(dir, 'tests/stripe.test.ts', "import Stripe from 'stripe'\n")
    const report = analyzeTestImpact({
      cwd: dir,
      diff: diffFor(dir, ['src/pay.ts']),
      policy: defaultPolicy,
    })
    expect(report.relatedTests).toEqual([])
    expect(report.affectedTestPaths).toEqual([])
  })
})

describe('parseArgs affected tests', () => {
  it('parses --affected-tests', () => {
    expect(parseArgs(['--affected-tests', '--skip-checks']).affectedTests).toBe(true)
  })
})
