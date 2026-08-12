import fs from 'node:fs'
import path from 'node:path'
import { CONFIG_SEARCH_PLACES } from '../policy/schema.js'

export interface ExistingConfig {
  relativePath: string
  absolutePath: string
  kind: 'file' | 'package.json'
}

function packageJsonHasAgentproof(cwd: string): boolean {
  const pkgPath = path.join(cwd, 'package.json')
  if (!fs.existsSync(pkgPath)) return false
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      agentproof?: unknown
    }
    return pkg.agentproof != null && typeof pkg.agentproof === 'object'
  } catch {
    return false
  }
}

/** First AgentProof config cosmiconfig would load, if any. */
export function findExistingConfig(cwd: string): ExistingConfig | null {
  for (const relativePath of CONFIG_SEARCH_PLACES) {
    const absolutePath = path.join(cwd, relativePath)
    if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
      return { relativePath, absolutePath, kind: 'file' }
    }
  }
  if (packageJsonHasAgentproof(cwd)) {
    return {
      relativePath: 'package.json',
      absolutePath: path.join(cwd, 'package.json'),
      kind: 'package.json',
    }
  }
  return null
}
