import { describe, expect, it } from 'vitest'
import { detectProject } from '../../src/detect/project.js'
import { detectFrameworks } from '../../src/detect/frameworks/index.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'

const here = path.dirname(fileURLToPath(import.meta.url))

describe('framework detection', () => {
  it('detects nestjs from package.json deps', () => {
    const fw = detectFrameworks(
      { dependencies: { '@nestjs/core': '10.0.0' } },
      new Set(),
    )
    expect(fw).toContain('nestjs')
  })

  it('detects nextjs', () => {
    const fw = detectFrameworks({ dependencies: { next: '14.0.0' } }, new Set(['next.config.js']))
    expect(fw).toContain('nextjs')
  })

  it('detects this agentproof package as node/typescript tooling', () => {
    const root = path.join(here, '../..')
    const project = detectProject(root)
    expect(project.runtime).toBe('node')
    expect(project.language).toBe('typescript')
  })
})

describe('fixtures presence', () => {
  it('has clean and vulnerable fixtures', () => {
    const fixtures = path.join(here, '../../fixtures')
    expect(fs.existsSync(path.join(fixtures, 'clean'))).toBe(true)
    expect(fs.existsSync(path.join(fixtures, 'vulnerable'))).toBe(true)
    expect(fs.existsSync(path.join(fixtures, 'false-positives'))).toBe(true)
  })
})

describe('temp project detection', () => {
  it('detects express + vitest', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-'))
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        dependencies: { express: '4.18.0' },
        devDependencies: { vitest: '3.0.0' },
        scripts: { test: 'vitest run', build: 'tsc' },
      }),
    )
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}')
    const project = detectProject(dir)
    expect(project.frameworks).toContain('express')
    expect(project.test.runner).toBe('vitest')
  })
})
