import fs from 'node:fs'
import path from 'node:path'
import type { PackageManager } from '../core/types.js'

export function detectPackageManager(root: string): PackageManager {
  if (fs.existsSync(path.join(root, 'bun.lockb')) || fs.existsSync(path.join(root, 'bun.lock'))) {
    return 'bun'
  }
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm'
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn'
  if (fs.existsSync(path.join(root, 'package-lock.json'))) return 'npm'

  const pkgPath = path.join(root, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
        packageManager?: string
      }
      if (pkg.packageManager?.startsWith('pnpm')) return 'pnpm'
      if (pkg.packageManager?.startsWith('yarn')) return 'yarn'
      if (pkg.packageManager?.startsWith('bun')) return 'bun'
    } catch {
      /* ignore */
    }
  }
  return 'npm'
}

export function runWithPm(pm: PackageManager, scriptArgs: string): string {
  switch (pm) {
    case 'pnpm':
      return `pnpm ${scriptArgs}`
    case 'yarn':
      return `yarn ${scriptArgs}`
    case 'bun':
      return `bun ${scriptArgs}`
    default: {
      // `npm test` / `npm start` work without `run`; other scripts need it.
      if (scriptArgs === 'test' || scriptArgs.startsWith('test ')) {
        return `npm ${scriptArgs}`
      }
      if (scriptArgs.startsWith('run ')) {
        return `npm ${scriptArgs}`
      }
      return `npm run ${scriptArgs}`
    }
  }
}
