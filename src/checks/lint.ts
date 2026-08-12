import type { CheckResult, NormalizedDiff } from '../core/types.js'

export interface LintIssue {
  file: string
  line: number
  message: string
  fingerprint: string
}

/** Parse common ESLint/Biome-style `file:line:col: message` lines. */
export function parseLintOutput(output: string, cwdHint = ''): LintIssue[] {
  const issues: LintIssue[] = []
  const seen = new Set<string>()
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    // path/to/file.ts:12:3: error message
    // path/to/file.ts(12,3): error message
    const m =
      line.match(/^(.+?):(\d+)(?::\d+)?\s*:\s*(.+)$/) ||
      line.match(/^(.+?)\((\d+)(?:,\d+)?\)\s*:\s*(.+)$/)
    if (!m) continue
    let file = m[1]!.replace(/\\/g, '/')
    if (cwdHint && file.startsWith(cwdHint)) {
      file = file.slice(cwdHint.length).replace(/^\//, '')
    }
    file = file.replace(/^\.\//, '')
    const lineNo = Number.parseInt(m[2]!, 10)
    const message = m[3]!.trim()
    const fingerprint = `${file}:${lineNo}:${message}`
    if (seen.has(fingerprint)) continue
    seen.add(fingerprint)
    issues.push({ file, line: lineNo, message, fingerprint })
  }
  return issues
}

function changedLineSet(diff: NormalizedDiff): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>()
  for (const file of diff.files) {
    const lines = new Set<number>()
    for (const hunk of file.hunks) {
      for (const hl of hunk.lines) {
        if (hl.type === 'add' && hl.newLineNumber != null) {
          lines.add(hl.newLineNumber)
        }
      }
    }
    // If we have no hunks but file changed, treat whole file as in-scope.
    if (lines.size === 0 && file.status !== 'D') {
      map.set(file.path, new Set()) // empty set => file-level match
    } else {
      map.set(file.path, lines)
    }
  }
  return map
}

/**
 * Keep only lint issues introduced on changed lines (or newly added files).
 * Issues outside the diff are treated as pre-existing baseline noise.
 */
export function filterNewLintIssues(
  issues: LintIssue[],
  diff: NormalizedDiff,
): LintIssue[] {
  if (diff.files.length === 0) return issues
  const changed = changedLineSet(diff)
  return issues.filter((issue) => {
    const norm = issue.file.replace(/\\/g, '/')
    const lines = changed.get(norm)
    if (!lines) {
      // Try basename / suffix match for absolute paths in lint output
      for (const [path, set] of changed) {
        if (norm.endsWith(path) || path.endsWith(norm)) {
          if (set.size === 0) return true
          return set.has(issue.line)
        }
      }
      return false
    }
    if (lines.size === 0) return true
    return lines.has(issue.line)
  })
}

export function lintResultFromIssues(
  allIssues: LintIssue[],
  newIssues: LintIssue[],
  required: boolean,
  durationMs: number,
  newIssuesOnly: boolean,
): CheckResult {
  if (!newIssuesOnly) {
    return {
      id: 'lint',
      title: 'Lint',
      status: allIssues.length === 0 ? 'passed' : 'failed',
      summary:
        allIssues.length === 0
          ? 'Passed'
          : `Failed (${allIssues.length} issue${allIssues.length === 1 ? '' : 's'})`,
      details: allIssues
        .slice(0, 40)
        .map((i) => `${i.file}:${i.line}: ${i.message}`)
        .join('\n'),
      durationMs,
    }
  }

  const suppressed = allIssues.length - newIssues.length
  if (newIssues.length === 0) {
    return {
      id: 'lint',
      title: 'Lint',
      status: 'passed',
      summary:
        suppressed > 0
          ? `Passed (new issues only; ${suppressed} existing suppressed)`
          : 'Passed',
      durationMs,
    }
  }

  return {
    id: 'lint',
    title: 'Lint',
    status: 'failed',
    summary: `Failed (${newIssues.length} new issue${newIssues.length === 1 ? '' : 's'}${
      suppressed > 0 ? `; ${suppressed} existing suppressed` : ''
    })`,
    details: newIssues
      .slice(0, 40)
      .map((i) => `${i.file}:${i.line}: ${i.message}`)
      .join('\n'),
    durationMs,
  }
}

export async function runLintCheck(options: {
  command: string | null
  cwd: string
  required: boolean
  diff: NormalizedDiff
  newIssuesOnly: boolean
  runCommand: (
    id: string,
    title: string,
    command: string | null,
    cwd: string,
    required: boolean,
    timeoutMs?: number,
  ) => Promise<CheckResult>
}): Promise<CheckResult> {
  const { command, cwd, required, diff, newIssuesOnly, runCommand } = options
  if (!command) {
    return {
      id: 'lint',
      title: 'Lint',
      status: required ? 'failed' : 'skipped',
      summary: required ? 'Required but no command detected' : 'Skipped (not configured)',
    }
  }

  if (!newIssuesOnly) {
    return runCommand('lint', 'Lint', command, cwd, required)
  }

  const start = Date.now()
  const raw = await runCommand('lint', 'Lint', command, cwd, false)
  const durationMs = Date.now() - start
  if (raw.status === 'passed') {
    return {
      ...raw,
      summary: 'Passed',
      durationMs: raw.durationMs ?? durationMs,
    }
  }

  const output = [raw.details, raw.summary].filter(Boolean).join('\n')
  const allIssues = parseLintOutput(output, cwd)
  // If we couldn't parse structured issues, fall back to full failure.
  if (allIssues.length === 0 && raw.status === 'failed') {
    return {
      ...raw,
      summary: `${raw.summary} (could not diff-filter; showing full lint)`,
      durationMs: raw.durationMs ?? durationMs,
    }
  }

  const newIssues = filterNewLintIssues(allIssues, diff)
  const result = lintResultFromIssues(
    allIssues,
    newIssues,
    required,
    raw.durationMs ?? durationMs,
    true,
  )
  // If required and new issues exist, failed; if not required, still report failed for visibility
  if (!required && result.status === 'failed') {
    return { ...result, status: 'warned' as CheckResult['status'] }
  }
  return result
}
