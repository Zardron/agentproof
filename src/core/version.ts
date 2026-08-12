import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
      }
      if (pkg.name === 'agentproof' && pkg.version) return pkg.version
    } catch {
      /* try next */
    }
  }
  return '0.0.0'
}
