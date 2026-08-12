import fs from 'node:fs'
import path from 'node:path'
import { cosmiconfig } from 'cosmiconfig'
import yaml from 'js-yaml'
import { z } from 'zod'

export const policySchema = z.object({
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
  dependencies: z
    .object({
      new_dependency: z
        .enum(['allow', 'warn', 'review', 'block'])
        .default('warn'),
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
})

export type Policy = z.infer<typeof policySchema>

export const defaultPolicy: Policy = policySchema.parse({})

export async function loadPolicy(
  cwd: string,
  configPath?: string,
): Promise<Policy> {
  if (configPath) {
    const abs = path.isAbsolute(configPath)
      ? configPath
      : path.join(cwd, configPath)
    const raw = fs.readFileSync(abs, 'utf8')
    const data = abs.endsWith('.json')
      ? JSON.parse(raw)
      : yaml.load(raw)
    return policySchema.parse(data ?? {})
  }

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
    },
  })

  const result = await explorer.search(cwd)
  if (!result || result.isEmpty) return defaultPolicy
  const data =
    result.config && typeof result.config === 'object' && 'agentproof' in (result.config as object)
      ? (result.config as { agentproof: unknown }).agentproof
      : result.config
  return policySchema.parse(data ?? {})
}
