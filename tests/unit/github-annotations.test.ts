import { afterEach, describe, expect, it } from 'vitest'
import { emitGithubAnnotations, formatGithubAnnotation, MAX_GITHUB_ANNOTATIONS, selectGithubAnnotations } from '../../src/reporters/github-annotations.js'
import type { Finding } from '../../src/core/types.js'

function finding(partial: Partial<Finding> & Pick<Finding, 'severity' | 'message'>): Finding {
  return {
    id: partial.id ?? 'f1',
    ruleId: partial.ruleId ?? 'sec.eval',
    title: partial.title ?? 'Unsafe eval',
    confidence: partial.confidence ?? 'high',
    category: partial.category ?? 'security',
    evidence: partial.evidence ?? {},
    file: partial.file,
    line: partial.line,
    ...partial,
  }
}

describe('GitHub annotations', () => {
  afterEach(() => {
    delete process.env.GITHUB_ACTIONS
  })

  it('formats file/line annotations without evidence secrets', () => {
    const line = formatGithubAnnotation(
      finding({
        severity: 'high',
        message: 'Authorization check may have been removed.',
        file: 'src/app/api/payment/route.ts',
        line: 42,
        evidence: { currentSnippet: 'sk-live-secret' },
      }),
    )
    expect(line).toContain('::error ')
    expect(line).toContain('file=src/app/api/payment/route.ts')
    expect(line).toContain('line=42')
    expect(line).toContain('AgentProof: Authorization check may have been removed.')
    expect(line).toContain('Risk: HIGH')
    expect(line).not.toContain('sk-live-secret')
  })

  it('caps annotations and prefers higher severity', () => {
    const findings = [
      ...Array.from({ length: 25 }, (_, i) =>
        finding({ id: `n${i}`, severity: 'low', message: `notice ${i}`, file: `n${i}.ts` }),
      ),
      finding({ id: 'crit', severity: 'critical', message: 'secret pattern', file: 'auth.ts' }),
      finding({ id: 'med', severity: 'medium', message: 'medium', file: 'x.ts' }),
    ]
    const { selected, omitted } = selectGithubAnnotations(findings)
    expect(selected[0]?.severity).toBe('critical')
    expect(selected.length).toBe(MAX_GITHUB_ANNOTATIONS)
    expect(omitted).toBe(findings.length - MAX_GITHUB_ANNOTATIONS)
  })

  it('does not emit outside GitHub Actions', () => {
    const lines: string[] = []
    emitGithubAnnotations([finding({ severity: 'high', message: 'x', file: 'a.ts' })], {
      write: (line) => lines.push(line),
    })
    expect(lines).toEqual([])
  })

  it('emits a summary notice when findings are omitted', () => {
    process.env.GITHUB_ACTIONS = 'true'
    const lines: string[] = []
    const findings = Array.from({ length: MAX_GITHUB_ANNOTATIONS + 3 }, (_, i) =>
      finding({ id: `f${i}`, severity: 'low', message: `n${i}`, file: `f${i}.ts` }),
    )
    emitGithubAnnotations(findings, { write: (line) => lines.push(line) })
    expect(lines).toHaveLength(MAX_GITHUB_ANNOTATIONS + 1)
    expect(lines.at(-1)).toContain('additional findings omitted')
  })
})
