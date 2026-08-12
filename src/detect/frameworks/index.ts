import type { FrameworkId, ProjectModel } from '../../core/types.js'

export interface FrameworkAdapter {
  id: FrameworkId
  detect(pkg: Record<string, unknown>, files: Set<string>): boolean
  envPrefixes(): string[]
  suggestBuild(scripts: Record<string, string>): { command: string; tool: string } | null
}

function hasDep(pkg: Record<string, unknown>, name: string): boolean {
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  }
  return Boolean(deps[name])
}

export const nodeAdapter: FrameworkAdapter = {
  id: 'node',
  detect: () => true,
  envPrefixes: () => [],
  suggestBuild: (scripts) => {
    if (scripts.build) return { command: 'build', tool: 'script' }
    return null
  },
}

export const expressAdapter: FrameworkAdapter = {
  id: 'express',
  detect: (pkg) => hasDep(pkg, 'express'),
  envPrefixes: () => [],
  suggestBuild: (scripts) =>
    scripts.build ? { command: 'build', tool: 'express' } : null,
}

export const nestjsAdapter: FrameworkAdapter = {
  id: 'nestjs',
  detect: (pkg) => hasDep(pkg, '@nestjs/core'),
  envPrefixes: () => [],
  suggestBuild: (scripts) =>
    scripts.build
      ? { command: 'build', tool: 'nestjs' }
      : { command: 'build', tool: 'nestjs' },
}

export const viteReactAdapter: FrameworkAdapter = {
  id: 'vite',
  detect: (pkg, files) =>
    hasDep(pkg, 'vite') || files.has('vite.config.ts') || files.has('vite.config.js'),
  envPrefixes: () => ['VITE_'],
  suggestBuild: (scripts) =>
    scripts.build ? { command: 'build', tool: 'vite' } : { command: 'build', tool: 'vite' },
}

export const reactAdapter: FrameworkAdapter = {
  id: 'react',
  detect: (pkg) => hasDep(pkg, 'react'),
  envPrefixes: () => [],
  suggestBuild: () => null,
}

export const nextjsAdapter: FrameworkAdapter = {
  id: 'nextjs',
  detect: (pkg, files) =>
    hasDep(pkg, 'next') || files.has('next.config.js') || files.has('next.config.mjs') || files.has('next.config.ts'),
  envPrefixes: () => ['NEXT_PUBLIC_'],
  suggestBuild: (scripts) =>
    scripts.build ? { command: 'build', tool: 'next' } : { command: 'build', tool: 'next' },
}

export const adapters: FrameworkAdapter[] = [
  nextjsAdapter,
  nestjsAdapter,
  viteReactAdapter,
  expressAdapter,
  reactAdapter,
  nodeAdapter,
]

export function detectFrameworks(
  pkg: Record<string, unknown>,
  files: Set<string>,
): FrameworkId[] {
  const found: FrameworkId[] = []
  for (const adapter of adapters) {
    if (adapter.id === 'node') continue
    if (adapter.detect(pkg, files)) found.push(adapter.id)
  }
  if (found.length === 0) found.push('node')
  return found
}

export function collectEnvPrefixes(frameworks: FrameworkId[]): string[] {
  const set = new Set<string>()
  for (const id of frameworks) {
    const adapter = adapters.find((a) => a.id === id)
    adapter?.envPrefixes().forEach((p) => set.add(p))
  }
  set.add('NUXT_PUBLIC_')
  return [...set]
}

export function describeProject(project: ProjectModel): string {
  const fw =
    project.frameworks.filter((f) => f !== 'node').join(' + ') || 'Node.js'
  const lang =
    project.language === 'typescript'
      ? 'TypeScript'
      : project.language === 'javascript'
        ? 'JavaScript'
        : 'TypeScript/JavaScript'
  return `${fw} + ${lang} + ${project.packageManager}`
}
