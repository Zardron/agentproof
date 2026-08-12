import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadPolicy } from '../../src/policy/schema.js'
import { findExistingConfig } from '../../src/init/existing.js'
import {
  buildStarterConfig,
  collectDetections,
  detectProtectedAreas,
  formatStarterConfig,
  inspectForInit,
} from '../../src/init/generate.js'
import { InitAbortedError, runInit } from '../../src/init/run.js'
import { detectProject } from '../../src/detect/project.js'

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function writeJson(dir: string, name: string, value: unknown): void {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2))
}

describe('init detections', () => {
  it('reports Next.js + TypeScript + npm + ESLint + Vitest + Drizzle', () => {
    const dir = tempDir('ap-init-next-')
    writeJson(dir, 'package.json', {
      name: 'demo',
      dependencies: { next: '14.0.0', react: '18.0.0', 'drizzle-orm': '0.36.0' },
      devDependencies: { typescript: '5.8.0', eslint: '9.0.0', vitest: '3.0.0' },
      scripts: { test: 'vitest run', lint: 'eslint .' },
    })
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}')
    fs.writeFileSync(path.join(dir, 'next.config.js'), 'module.exports = {}')
    fs.writeFileSync(path.join(dir, 'eslint.config.js'), 'export default []')
    fs.mkdirSync(path.join(dir, 'src/app/api'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'src/auth'), { recursive: true })

    const project = detectProject(dir)
    const labels = collectDetections(project).map((d) => d.label)
    expect(labels).toContain('Node.js')
    expect(labels).toContain('TypeScript')
    expect(labels).toContain('Next.js')
    expect(labels).toContain('npm')
    expect(labels).toContain('ESLint')
    expect(labels).toContain('Vitest')
    expect(labels).toContain('Drizzle')
    expect(detectProtectedAreas(dir)).toEqual(
      expect.arrayContaining(['src/auth/**', 'src/app/api/**']),
    )
  })

  it('reports a JavaScript Express project without requiring typecheck', () => {
    const dir = tempDir('ap-init-js-')
    writeJson(dir, 'package.json', {
      name: 'api',
      dependencies: { express: '4.21.0' },
    })
    const inspected = inspectForInit(dir)
    expect(inspected.detections.map((d) => d.label)).toEqual(
      expect.arrayContaining(['Node.js', 'JavaScript', 'Express', 'npm']),
    )
    expect(inspected.config.require).toEqual({ typecheck: false })
    expect(inspected.preferredFileName).toBe('agentproof.config.yaml')
  })
})

describe('starter config generation', () => {
  it('emits a minimal TypeScript config that loadPolicy accepts', async () => {
    const dir = tempDir('ap-init-ts-')
    writeJson(dir, 'package.json', {
      name: 'lib',
      devDependencies: { typescript: '5.8.0' },
    })
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}')
    const project = detectProject(dir)
    const config = buildStarterConfig(project)
    expect(config.extends).toBe('ci')
    expect(config.fail_on).toBe('high')
    expect(config.require).toBeUndefined()

    const file = path.join(dir, 'agentproof.config.ts')
    fs.writeFileSync(file, formatStarterConfig(config, 'ts'))
    const policy = await loadPolicy(dir)
    expect(policy.fail_on).toBe('high')
    expect(policy.require.typecheck).toBe(true)
    expect(policy.security.secret_detection).toBe(true)
  })

  it('only includes protected_areas for directories that exist', () => {
    const dir = tempDir('ap-init-prot-')
    writeJson(dir, 'package.json', { name: 'x' })
    fs.mkdirSync(path.join(dir, 'prisma/migrations'), { recursive: true })
    expect(detectProtectedAreas(dir)).toEqual(['prisma/migrations/**'])
    expect(buildStarterConfig(detectProject(dir)).protected_areas).toEqual([
      'prisma/migrations/**',
    ])
  })
})

describe('runInit', () => {
  it('writes agentproof.config.ts for a TypeScript project', async () => {
    const dir = tempDir('ap-init-write-')
    writeJson(dir, 'package.json', { name: 'app', devDependencies: { typescript: '5' } })
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}')

    const result = await runInit({ cwd: dir, force: false, interactive: false })
    expect(result.fileName).toBe('agentproof.config.ts')
    expect(result.overwritten).toBe(false)
    expect(fs.existsSync(path.join(dir, 'agentproof.config.ts'))).toBe(true)
    expect(result.output).toContain('AgentProof Setup')
    expect(result.output).toContain('✓ Detected TypeScript')
    expect(result.output).toContain('Created:')
    expect(result.output).toContain('npx agentproof --base main')
    const policy = await loadPolicy(dir)
    expect(policy.require.typecheck).toBe(true)
  })

  it('writes yaml for a JavaScript project', async () => {
    const dir = tempDir('ap-init-yaml-')
    writeJson(dir, 'package.json', { name: 'app' })
    const result = await runInit({ cwd: dir, force: false, interactive: false })
    expect(result.fileName).toBe('agentproof.config.yaml')
    const raw = fs.readFileSync(path.join(dir, 'agentproof.config.yaml'), 'utf8')
    expect(raw).toContain('extends: ci')
    expect(raw).toContain('typecheck: false')
    const policy = await loadPolicy(dir)
    expect(policy.require.typecheck).toBe(false)
  })

  it('refuses to overwrite an existing config without --force in non-interactive mode', async () => {
    const dir = tempDir('ap-init-exists-')
    writeJson(dir, 'package.json', { name: 'app' })
    fs.writeFileSync(path.join(dir, 'agentproof.config.yaml'), 'extends: relaxed\n')

    await expect(runInit({ cwd: dir, force: false, interactive: false })).rejects.toBeInstanceOf(
      InitAbortedError,
    )
    expect(fs.readFileSync(path.join(dir, 'agentproof.config.yaml'), 'utf8')).toBe(
      'extends: relaxed\n',
    )
    expect(findExistingConfig(dir)?.relativePath).toBe('agentproof.config.yaml')
  })

  it('overwrites with --force', async () => {
    const dir = tempDir('ap-init-force-')
    writeJson(dir, 'package.json', { name: 'app' })
    fs.writeFileSync(path.join(dir, 'agentproof.config.yaml'), 'extends: relaxed\n')

    const result = await runInit({ cwd: dir, force: true, interactive: false })
    expect(result.overwritten).toBe(true)
    expect(result.fileName).toBe('agentproof.config.yaml')
    expect(result.output).toContain('Updated:')
    const raw = fs.readFileSync(path.join(dir, 'agentproof.config.yaml'), 'utf8')
    expect(raw).toContain('extends: ci')
    expect(raw).not.toContain('relaxed')
  })

  it('treats package.json agentproof as an existing config', async () => {
    const dir = tempDir('ap-init-pkg-')
    writeJson(dir, 'package.json', { name: 'app', agentproof: { extends: 'strict' } })

    await expect(runInit({ cwd: dir, force: false, interactive: false })).rejects.toThrow(
      /package\.json/,
    )
    const result = await runInit({ cwd: dir, force: true, interactive: false })
    expect(result.fileName).toBe('agentproof.config.yaml')
    expect(fs.existsSync(path.join(dir, 'agentproof.config.yaml'))).toBe(true)
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
      agentproof: unknown
    }
    expect(pkg.agentproof).toEqual({ extends: 'strict' })
  })

  it('overwrites after an interactive yes, and aborts after no', async () => {
    const dir = tempDir('ap-init-prompt-')
    writeJson(dir, 'package.json', { name: 'app' })
    fs.writeFileSync(path.join(dir, 'agentproof.config.yaml'), 'extends: relaxed\n')

    await expect(
      runInit({
        cwd: dir,
        force: false,
        interactive: true,
        confirm: async () => false,
      }),
    ).rejects.toBeInstanceOf(InitAbortedError)

    const result = await runInit({
      cwd: dir,
      force: false,
      interactive: true,
      confirm: async () => true,
    })
    expect(result.overwritten).toBe(true)
    expect(fs.readFileSync(path.join(dir, 'agentproof.config.yaml'), 'utf8')).toContain(
      'extends: ci',
    )
  })
})
