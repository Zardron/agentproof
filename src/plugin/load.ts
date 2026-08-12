import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import type { Rule } from '../rules/interface.js'
import type { PluginDefinition } from './types.js'

const REMOTE_RE = /^(https?:|git\+|git:|ssh:|data:)/i
const PACKAGE_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i

export function assertSafePluginSpecifier(specifier: string): void {
  const trimmed = specifier.trim()
  if (!trimmed) {
    throw new Error('plugins entries must be non-empty strings')
  }
  if (REMOTE_RE.test(trimmed)) {
    throw new Error(
      `Refusing to load remote plugin "${trimmed}". Install the package locally and reference a package name or filesystem path.`,
    )
  }
}

function isFilesystemPath(specifier: string): boolean {
  return (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    path.isAbsolute(specifier) ||
    specifier.startsWith('file:') ||
    /\.(mts|cts|ts|mjs|cjs|js)$/.test(specifier)
  )
}

async function importModule(absOrUrl: string): Promise<unknown> {
  if (absOrUrl.endsWith('.ts') || absOrUrl.endsWith('.mts') || absOrUrl.endsWith('.cts')) {
    const { createJiti } = await import('jiti')
    const jiti = createJiti(import.meta.url)
    return jiti.import(absOrUrl)
  }
  const url = absOrUrl.startsWith('file:') ? absOrUrl : pathToFileURL(absOrUrl).href
  return import(url)
}

function asRules(loaded: unknown, specifier: string): Rule[] {
  const mod =
    loaded && typeof loaded === 'object' && 'default' in (loaded as object)
      ? (loaded as { default: unknown }).default
      : loaded

  if (!mod) {
    throw new Error(`Plugin "${specifier}" exported nothing`)
  }

  if (Array.isArray(mod)) {
    return mod as Rule[]
  }

  if (typeof mod === 'object') {
    const maybePlugin = mod as Partial<PluginDefinition> & { rules?: Rule[] }
    if (Array.isArray(maybePlugin.rules)) {
      return maybePlugin.rules
    }
    // Single rule object
    if (
      typeof (maybePlugin as Rule).id === 'string' &&
      typeof (maybePlugin as Rule).run === 'function'
    ) {
      return [maybePlugin as Rule]
    }
  }

  throw new Error(
    `Plugin "${specifier}" must export definePlugin({ rules }), a Rule[], or a Rule`,
  )
}

async function resolveAndLoad(cwd: string, specifier: string): Promise<Rule[]> {
  assertSafePluginSpecifier(specifier)

  if (isFilesystemPath(specifier)) {
    const abs = path.isAbsolute(specifier)
      ? specifier
      : path.resolve(cwd, specifier)
    if (!fs.existsSync(abs)) {
      throw new Error(`Plugin path not found: ${specifier} (resolved to ${abs})`)
    }
    return asRules(await importModule(abs), specifier)
  }

  if (!PACKAGE_RE.test(specifier)) {
    throw new Error(
      `Invalid plugin specifier "${specifier}". Use a local path (./rules/foo.ts) or an installed package name.`,
    )
  }

  const require = createRequire(path.join(cwd, 'package.json'))
  let resolved: string
  try {
    resolved = require.resolve(specifier)
  } catch {
    throw new Error(
      `Could not resolve plugin package "${specifier}" from ${cwd}. Install it in this project first.`,
    )
  }
  return asRules(await importModule(resolved), specifier)
}

/** Load rules from explicit config `plugins` entries only. */
export async function loadPluginRules(cwd: string, plugins: string[]): Promise<Rule[]> {
  if (!plugins.length) return []
  const rules: Rule[] = []
  const seen = new Set<string>()
  for (const specifier of plugins) {
    const loaded = await resolveAndLoad(cwd, specifier)
    for (const rule of loaded) {
      if (!rule?.id || typeof rule.run !== 'function') {
        throw new Error(`Plugin "${specifier}" produced an invalid rule`)
      }
      if (seen.has(rule.id)) {
        throw new Error(`Duplicate rule id "${rule.id}" from plugin "${specifier}"`)
      }
      seen.add(rule.id)
      rules.push(rule)
    }
  }
  return rules
}
