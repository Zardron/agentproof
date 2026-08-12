import path from 'node:path'
import micromatch from 'micromatch'
import type { NormalizedDiff, TestImpactReport, TestImpactLink, UntestedSource, TestLinkConfidence } from '../core/types.js'
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

export function analyzeTestImpact(options: {
  cwd: string
  diff: NormalizedDiff
  policy: Policy
}): TestImpactReport {
  const files = listProjectFiles(options.cwd)
  const fileSet = new Set(files)
  const tests = files.filter((file) => isTestPath(file))
  const changedSourceFiles = options.diff.files
    .filter((file) => file.status !== 'D' && isSourceFile(file.path))
    .map((file) => posixPath(file.path))
    .sort()

  const importedByChanged = new Set<string>()
  for (const source of changedSourceFiles) {
    const specifiers = parseRelativeImports(readFile(options.cwd, source))
    for (const spec of specifiers) {
      const resolved = resolveRelativeImport(source, spec, fileSet)
      if (resolved && isSourceFile(resolved)) importedByChanged.add(resolved)
    }
  }

  const affectedModules = [...new Set([...changedSourceFiles, ...importedByChanged])].sort()
  const watch = new Set(affectedModules)

  const testsBySource = new Map<string, { tests: Set<string>; confidence: TestLinkConfidence }>()
  const ensure = (source: string, confidence: TestLinkConfidence) => {
    const current = testsBySource.get(source)
    if (!current) {
      testsBySource.set(source, { tests: new Set(), confidence })
      return testsBySource.get(source)!
    }
    if (confidence === 'import') current.confidence = 'import'
    return current
  }

  for (const testFile of tests) {
    const specifiers = parseRelativeImports(readFile(options.cwd, testFile))
    for (const spec of specifiers) {
      const resolved = resolveRelativeImport(testFile, spec, fileSet)
      if (resolved && watch.has(resolved)) {
        ensure(resolved, 'import').tests.add(testFile)
      }
    }
  }

  for (const source of changedSourceFiles) {
    for (const candidate of namingCandidates(source)) {
      if (fileSet.has(candidate)) ensure(source, 'naming').tests.add(candidate)
    }
  }

  const relatedTests: TestImpactLink[] = changedSourceFiles
    .map((source) => {
      const linked = testsBySource.get(source)
      if (!linked || linked.tests.size === 0) return null
      return {
        source,
        tests: [...linked.tests].sort(),
        confidence: linked.confidence,
      }
    })
    .filter((row): row is TestImpactLink => row !== null)

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
