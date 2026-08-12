import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function isAgentProofPackage(pkg: { name?: string; bin?: unknown }): boolean {
  if (pkg.name === 'agentproof-cli' || pkg.name === 'agentproof') return true
  if (typeof pkg.name === 'string' && pkg.name.endsWith('/agentproof')) return true
  if (pkg.bin && typeof pkg.bin === 'object' && pkg.bin !== null && 'agentproof' in pkg.bin) {
    return true
  }
  return false
}

export function getVersion(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.join(here, '../../package.json'),
    path.join(here, '../package.json'),
    path.join(process.cwd(), 'package.json'),
  ]
  for (const candidate of candidates) {
    try {
      const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8')) as {
        name?: string
        version?: string
        bin?: Record<string, string>
      }
      if (isAgentProofPackage(pkg) && pkg.version) return pkg.version
    } catch {
      /* try next */
    }
  }
  return '0.0.0'
}
