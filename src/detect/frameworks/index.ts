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

function scriptBuild(
  scripts: Record<string, string>,
  tool: string,
): { command: string; tool: string } | null {
  return scripts.build ? { command: 'build', tool } : { command: 'build', tool }
}

export const nodeAdapter: FrameworkAdapter = {
  id: 'node',
  detect: () => true,
  envPrefixes: () => [],
  suggestBuild: (scripts) => (scripts.build ? { command: 'build', tool: 'script' } : null),
}

export const expressAdapter: FrameworkAdapter = {
  id: 'express',
  detect: (pkg) => hasDep(pkg, 'express'),
  envPrefixes: () => [],
  suggestBuild: (scripts) => (scripts.build ? { command: 'build', tool: 'express' } : null),
}

export const fastifyAdapter: FrameworkAdapter = {
  id: 'fastify',
  detect: (pkg) => hasDep(pkg, 'fastify'),
  envPrefixes: () => [],
  suggestBuild: (scripts) => (scripts.build ? { command: 'build', tool: 'fastify' } : null),
}

export const honoAdapter: FrameworkAdapter = {
  id: 'hono',
  detect: (pkg) => hasDep(pkg, 'hono'),
  envPrefixes: () => [],
  suggestBuild: (scripts) => (scripts.build ? { command: 'build', tool: 'hono' } : null),
}

export const nestjsAdapter: FrameworkAdapter = {
  id: 'nestjs',
  detect: (pkg) => hasDep(pkg, '@nestjs/core'),
  envPrefixes: () => [],
  suggestBuild: (scripts) => scriptBuild(scripts, 'nestjs'),
}

export const viteReactAdapter: FrameworkAdapter = {
  id: 'vite',
  detect: (pkg, files) =>
    hasDep(pkg, 'vite') || files.has('vite.config.ts') || files.has('vite.config.js') || files.has('vite.config.mjs'),
  envPrefixes: () => ['VITE_'],
  suggestBuild: (scripts) => scriptBuild(scripts, 'vite'),
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
    hasDep(pkg, 'next') ||
    files.has('next.config.js') ||
    files.has('next.config.mjs') ||
    files.has('next.config.ts'),
  envPrefixes: () => ['NEXT_PUBLIC_'],
  suggestBuild: (scripts) => scriptBuild(scripts, 'next'),
}

export const remixAdapter: FrameworkAdapter = {
  id: 'remix',
  detect: (pkg, files) =>
    hasDep(pkg, '@remix-run/node') ||
    hasDep(pkg, '@remix-run/react') ||
    (hasDep(pkg, 'react-router') && files.has('react-router.config.ts')) ||
    files.has('remix.config.js') ||
    files.has('remix.config.ts'),
  envPrefixes: () => [],
  suggestBuild: (scripts) => scriptBuild(scripts, 'remix'),
}

export const astroAdapter: FrameworkAdapter = {
  id: 'astro',
  detect: (pkg, files) =>
    hasDep(pkg, 'astro') || files.has('astro.config.mjs') || files.has('astro.config.ts'),
  envPrefixes: () => ['PUBLIC_'],
  suggestBuild: (scripts) => scriptBuild(scripts, 'astro'),
}

export const nuxtAdapter: FrameworkAdapter = {
  id: 'nuxt',
  detect: (pkg, files) =>
    hasDep(pkg, 'nuxt') || files.has('nuxt.config.ts') || files.has('nuxt.config.js'),
  envPrefixes: () => ['NUXT_PUBLIC_'],
  suggestBuild: (scripts) => scriptBuild(scripts, 'nuxt'),
}

export const vueAdapter: FrameworkAdapter = {
  id: 'vue',
  detect: (pkg) => hasDep(pkg, 'vue'),
  envPrefixes: () => ['VITE_'],
  suggestBuild: () => null,
}

export const sveltekitAdapter: FrameworkAdapter = {
  id: 'sveltekit',
  detect: (pkg, files) =>
    hasDep(pkg, '@sveltejs/kit') || files.has('svelte.config.js') || files.has('svelte.config.ts'),
  envPrefixes: () => ['PUBLIC_', 'VITE_'],
  suggestBuild: (scripts) => scriptBuild(scripts, 'sveltekit'),
}

export const angularAdapter: FrameworkAdapter = {
  id: 'angular',
  detect: (pkg, files) =>
    hasDep(pkg, '@angular/core') || files.has('angular.json'),
  envPrefixes: () => [],
  suggestBuild: (scripts) => scriptBuild(scripts, 'angular'),
}

export const adapters: FrameworkAdapter[] = [
  nextjsAdapter,
  nuxtAdapter,
  remixAdapter,
  sveltekitAdapter,
  astroAdapter,
  angularAdapter,
  nestjsAdapter,
  viteReactAdapter,
  vueAdapter,
  reactAdapter,
  fastifyAdapter,
  honoAdapter,
  expressAdapter,
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
