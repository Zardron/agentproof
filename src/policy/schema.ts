import fs from 'node:fs'
import path from 'node:path'
import { cosmiconfig } from 'cosmiconfig'
import yaml from 'js-yaml'
import { z } from 'zod'
import { resolveExtends } from './packs.js'

export const policySchema = z.object({
  extends: z.union([z.string(), z.array(z.string())]).optional(),
  fail_on: z
    .enum(['none', 'low', 'medium', 'high', 'critical'])
    .default('high'),
  protected_areas: z.array(z.string()).default([]),
  require: z
    .object({
      build: z.boolean().default(false),
      tests: z.boolean().default(false),
      typecheck: z.boolean().default(true),
      lint: z.boolean().default(false),
    })
    .default({}),
  lint: z
    .object({
      /** When true, only lint issues on changed lines fail the check. */
      new_issues_only: z.boolean().default(true),
    })
    .default({}),
  dependencies: z
    .object({
      new_dependency: z
        .enum(['allow', 'warn', 'review', 'block'])
        .default('warn'),
      advisories: z.boolean().default(true),
    })
    .default({}),
  security: z
    .object({
      secret_detection: z.boolean().default(true),
      auth_regression: z.boolean().default(true),
    })
    .default({}),
  ignore_rules: z.array(z.string()).default([]),
  severity_overrides: z
    .record(z.enum(['critical', 'high', 'medium', 'low', 'info']))
    .default({}),
  /**
   * Explicit local plugin modules to load (package names or filesystem paths).
   * Remote URLs are rejected at load time.
   */
  plugins: z.array(z.string()).default([]),
})

export type Policy = z.infer<typeof policySchema>

export const defaultPolicy: Policy = policySchema.parse({})

async function loadTsConfig(abs: string): Promise<unknown> {
  const { createJiti } = await import('jiti')
  const jiti = createJiti(import.meta.url)
  const loaded = await jiti.import(abs)
  if (loaded && typeof loaded === 'object' && 'default' in loaded) {
    return (loaded as { default: unknown }).default
  }
  return loaded
}

async function parseConfigFile(abs: string): Promise<unknown> {
  if (abs.endsWith('.ts') || abs.endsWith('.mts') || abs.endsWith('.cts')) {
    return loadTsConfig(abs)
  }
  if (abs.endsWith('.js') || abs.endsWith('.mjs') || abs.endsWith('.cjs')) {
    const loaded = await import(abs)
    return loaded.default ?? loaded
  }
  const raw = fs.readFileSync(abs, 'utf8')
  if (abs.endsWith('.json')) return JSON.parse(raw)
  return yaml.load(raw)
}

export async function loadPolicy(
  cwd: string,
  configPath?: string,
): Promise<Policy> {
  let raw: unknown = {}

  if (configPath) {
    const abs = path.isAbsolute(configPath)
      ? configPath
      : path.join(cwd, configPath)
    raw = (await parseConfigFile(abs)) ?? {}
  } else {
    const explorer = cosmiconfig('agentproof', {
      searchPlaces: [
        'agentproof.config.yaml',
        'agentproof.config.yml',
        'agentproof.config.json',
        'agentproof.config.ts',
        'agentproof.config.js',
        'agentproof.config.mjs',
        '.agentproofrc',
        '.agentproofrc.yaml',
        '.agentproofrc.yml',
        '.agentproofrc.json',
        'package.json',
      ],
      loaders: {
        '.yaml': (_filepath, content) => yaml.load(content),
        '.yml': (_filepath, content) => yaml.load(content),
        '.ts': async (filepath) => loadTsConfig(filepath),
        '.mts': async (filepath) => loadTsConfig(filepath),
      },
    })

    const result = await explorer.search(cwd)
    if (result && !result.isEmpty) {
      raw =
        result.config &&
        typeof result.config === 'object' &&
        'agentproof' in (result.config as object)
          ? (result.config as { agentproof: unknown }).agentproof
          : result.config
    }
  }

  const asObject =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const merged = resolveExtends(asObject, cwd)
  return policySchema.parse(merged)
}
