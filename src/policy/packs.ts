import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

export const BUILTIN_PACKS: Record<string, Record<string, unknown>> = {
  strict: {
    fail_on: 'high',
    require: {
      build: true,
      tests: true,
      typecheck: true,
      lint: true,
    },
    dependencies: {
      new_dependency: 'review',
      advisories: true,
    },
    security: {
      secret_detection: true,
      auth_regression: true,
    },
  },
  security: {
    fail_on: 'high',
    require: {
      typecheck: true,
    },
    dependencies: {
      new_dependency: 'review',
      advisories: true,
    },
    security: {
      secret_detection: true,
      auth_regression: true,
    },
  },
  relaxed: {
    fail_on: 'critical',
    require: {
      typecheck: false,
      build: false,
      tests: false,
      lint: false,
    },
    dependencies: {
      new_dependency: 'warn',
      advisories: true,
    },
    security: {
      secret_detection: true,
      auth_regression: true,
    },
  },
  ci: {
    fail_on: 'high',
    require: {
      typecheck: true,
      build: false,
      tests: false,
      lint: false,
    },
    lint: {
      new_issues_only: true,
    },
    dependencies: {
      new_dependency: 'warn',
      advisories: true,
    },
    security: {
      secret_detection: true,
      auth_regression: true,
    },
  },
}

function packsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  // Prefer packaged packs next to dist, then source packs during tests.
  const candidates = [
    path.join(here, '../../packs'),
    path.join(here, '../../../packs'),
    path.join(process.cwd(), 'packs'),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  return candidates[0]!
}

export function listBuiltinPackNames(): string[] {
  return Object.keys(BUILTIN_PACKS)
}

export function loadPack(
  nameOrPath: string,
  cwd: string,
): Record<string, unknown> {
  const key = nameOrPath.replace(/^agentproof:/, '').trim()
  if (BUILTIN_PACKS[key]) {
    return structuredClone(BUILTIN_PACKS[key]!)
  }

  const filePath = path.isAbsolute(nameOrPath)
    ? nameOrPath
    : path.join(cwd, nameOrPath)

  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = filePath.endsWith('.json') ? JSON.parse(raw) : yaml.load(raw)
    if (!data || typeof data !== 'object') {
      throw new Error(`Policy pack is empty or invalid: ${nameOrPath}`)
    }
    return data as Record<string, unknown>
  }

  // Built-in pack YAML files (optional on-disk copies)
  const bundled = path.join(packsDir(), `${key}.yaml`)
  if (fs.existsSync(bundled)) {
    const data = yaml.load(fs.readFileSync(bundled, 'utf8'))
    if (data && typeof data === 'object') return data as Record<string, unknown>
  }

  throw new Error(
    `Unknown policy pack "${nameOrPath}". Built-ins: ${listBuiltinPackNames().join(', ')}. Or pass a local YAML/JSON path.`,
  )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Deep-merge pack layers; later layers win. Arrays are replaced, not concatenated. */
export function mergePolicyLayers(
  layers: Record<string, unknown>[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      if (key === 'extends') continue
      if (isPlainObject(value) && isPlainObject(out[key])) {
        out[key] = mergePolicyLayers([
          out[key] as Record<string, unknown>,
          value,
        ])
      } else {
        out[key] = value
      }
    }
  }
  return out
}

export function resolveExtends(
  config: Record<string, unknown>,
  cwd: string,
  stack: string[] = [],
): Record<string, unknown> {
  const extendsRaw = config.extends
  const extendsList = Array.isArray(extendsRaw)
    ? extendsRaw.map(String)
    : typeof extendsRaw === 'string'
      ? [extendsRaw]
      : []

  const layers: Record<string, unknown>[] = []
  for (const name of extendsList) {
    if (stack.includes(name)) {
      throw new Error(`Circular policy pack extends: ${[...stack, name].join(' -> ')}`)
    }
    const pack = loadPack(name, cwd)
    layers.push(resolveExtends(pack, cwd, [...stack, name]))
  }
  layers.push(config)
  return mergePolicyLayers(layers)
}
