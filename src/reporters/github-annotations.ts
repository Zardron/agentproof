import type { Finding } from '../core/types.js'
import { isGithubActions } from '../ci/detect.js'

function escapeData(s: string): string {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
}

export function emitGithubAnnotations(findings: Finding[]): void {
  if (!isGithubActions()) return
  for (const f of findings) {
    const level =
      f.severity === 'critical' || f.severity === 'high'
        ? 'error'
        : f.severity === 'medium'
          ? 'warning'
          : 'notice'
    const file = f.file ? `file=${escapeData(f.file)}` : ''
    const line = f.line ? `line=${f.line}` : ''
    const title = `title=${escapeData(f.title)}`
    const props = [file, line, title].filter(Boolean).join(',')
    console.log(`::${level} ${props}::${escapeData(f.message)}`)
  }
}
