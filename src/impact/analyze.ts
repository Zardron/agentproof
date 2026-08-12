import path from 'node:path'
import micromatch from 'micromatch'
import type {
  NormalizedDiff,
  TestImpactReport,
  TestImpactLink,
  UntestedSource,
  TestLinkConfidence,
} from '../core/types.js'
import type { Policy } from '../policy/schema.js'
import { isHighRiskDomain, isTestPath } from '../git/classify.js'
import { parseRelativeImports } from './imports.js'
import {
  isSourceFile,
  listProjectFiles,
  posixPath,
  readFile,
  resolveRelativeImport,
} from './files.js'

export type { TestImpactReport, TestImpactLink, UntestedSource, TestLinkConfidence }

function stem(filePath: string): string {
  return path.posix.basename(filePath).replace(/\.(tsx?|jsx?|mjs|cjs|mts|cts)$/, '')
}

function namingCandidates(source: string): string[] {
  const base = stem(source)
  const dir = path.posix.dirname(source)
  return [
    `${dir}/${base}.test.ts`,
    `${dir}/${base}.test.tsx`,
    `${dir}/${base}.spec.ts`,
    `${dir}/${base}.spec.tsx`,
    `tests/${base}.test.ts`,
    `tests/${base}.spec.ts`,
    `test/${base}.test.ts`,
    source.replace(/^src\//, 'tests/').replace(/\.(tsx?|jsx?)$/, '.test.ts'),
    source.replace(/^src\//, 'tests/').replace(/\.(tsx?|jsx?)$/, '.test.tsx'),
  ].map(posixPath)
}

function isCriticalSource(filePath: string, diff: NormalizedDiff, policy: Policy): boolean {
  const file = diff.files.find((f) => posixPath(f.path) === filePath)
  if (file?.riskDomains.some(isHighRiskDomain)) return true
  if (policy.protected_areas.length > 0 && micromatch.isMatch(filePath, policy.protected_areas)) {
    return true
  }
  return false
}

/** Forward edges: file → relative imports it resolves to. */
function buildImportGraph(
  cwd: string,
  sources: string[],
  fileSet: Set<string>,
): Map<string, string[]> {
  const graph = new Map<string, string[]>()
  for (const source of sources) {
    const targets: string[] = []
    for (const spec of parseRelativeImports(readFile(cwd, source))) {
      const resolved = resolveRelativeImport(source, spec, fileSet)
      if (resolved && isSourceFile(resolved)) targets.push(resolved)
    }
    graph.set(source, targets)
  }
  return graph
}

function reverseGraph(forward: Map<string, string[]>): Map<string, string[]> {
  const reverse = new Map<string, string[]>()
  for (const [from, tos] of forward) {
    for (const to of tos) {
      const list = reverse.get(to)
      if (list) list.push(from)
      else reverse.set(to, [from])
    }
  }
  return reverse
}

/** BFS over edges starting from seeds. */
function collectReachable(
  seeds: Iterable<string>,
  edges: Map<string, string[]>,
): Set<string> {
  const out = new Set<string>()
  const queue = [...seeds]
  while (queue.length > 0) {
    const node = queue.pop()!
    if (out.has(node)) continue
    out.add(node)
    for (const next of edges.get(node) ?? []) {
      if (!out.has(next)) queue.push(next)
    }
  }
  return out
}

export function analyzeTestImpact(options: {
  cwd: string
  diff: NormalizedDiff
  policy: Policy
}): TestImpactReport {
  const files = listProjectFiles(options.cwd)
  const fileSet = new Set(files)
  const tests = files.filter((file) => isTestPath(file))
  const sources = files.filter((file) => isSourceFile(file))
  const changedSourceFiles = options.diff.files
    .filter((file) => file.status !== 'D' && isSourceFile(file.path))
    .map((file) => posixPath(file.path))
    .sort()

  const forward = buildImportGraph(options.cwd, sources, fileSet)
  const reverse = reverseGraph(forward)

  // Dependents (who imports a changed file, transitively) + direct deps of changed files.
  const dependents = collectReachable(changedSourceFiles, reverse)
  const directDeps = new Set<string>()
  for (const source of changedSourceFiles) {
    for (const dep of forward.get(source) ?? []) directDeps.add(dep)
  }

  const affectedModules = [
    ...new Set([...changedSourceFiles, ...dependents, ...directDeps]),
  ].sort()

  // test → source files it imports (resolved)
  const testImports = new Map<string, string[]>()
  for (const testFile of tests) {
    const imported: string[] = []
    for (const spec of parseRelativeImports(readFile(options.cwd, testFile))) {
      const resolved = resolveRelativeImport(testFile, spec, fileSet)
      if (resolved && isSourceFile(resolved)) imported.push(resolved)
    }
    testImports.set(testFile, imported)
  }

  const relatedTests: TestImpactLink[] = []
  for (const source of changedSourceFiles) {
    // Modules impacted by this specific change: the file itself + transitive importers.
    const closure = collectReachable([source], reverse)
    const testsForSource = new Map<string, TestLinkConfidence>()

    for (const [testFile, imported] of testImports) {
      if (imported.some((mod) => closure.has(mod))) {
        testsForSource.set(testFile, 'import')
      }
    }

    for (const candidate of namingCandidates(source)) {
      if (fileSet.has(candidate) && !testsForSource.has(candidate)) {
        testsForSource.set(candidate, 'naming')
      }
    }

    if (testsForSource.size === 0) continue
    const confidence: TestLinkConfidence = [...testsForSource.values()].includes('import')
      ? 'import'
      : 'naming'
    relatedTests.push({
      source,
      tests: [...testsForSource.keys()].sort(),
      confidence,
    })
  }

  const linkedSources = new Set(relatedTests.map((row) => row.source))
  const untested: UntestedSource[] = changedSourceFiles
    .filter((source) => !linkedSources.has(source))
    .map((source) => ({
      source,
      critical: isCriticalSource(source, options.diff, options.policy),
    }))

  const affectedTestPaths = [...new Set(relatedTests.flatMap((row) => row.tests))].sort()

  return {
    changedSourceFiles,
    affectedModules,
    relatedTests,
    untested,
    affectedTestPaths,
  }
}

export function formatAffectedTests(report: TestImpactReport): string {
  if (report.affectedTestPaths.length === 0) return ''
  return `${report.affectedTestPaths.join('\n')}\n`
}
