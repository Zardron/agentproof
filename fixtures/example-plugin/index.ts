import {
  addedLines,
  createFinding,
  definePlugin,
  defineRule,
} from '../../src/plugin/index.js'

/**
 * Minimal example plugin for AgentProof.
 * Enable with:
 *
 * plugins:
 *   - ./fixtures/example-plugin/index.ts
 */
export default definePlugin({
  name: 'example-agentproof-rules',
  rules: [
    defineRule({
      id: 'example.no-console-log',
      title: 'console.log in application code',
      category: 'custom',
      severity: 'medium',
      confidence: 'confirmed',
      analyze(ctx) {
        const findings = []
        for (const file of ctx.diff.files) {
          if (!/\.[cm]?[jt]sx?$/.test(file.path)) continue
          if (/(^|\/)(tests?|__tests__|spec)\//.test(file.path)) continue
          if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(file.path)) continue
          for (const { line, content } of addedLines(file)) {
            if (/^\s*(\/\/|\/\*|\*)/.test(content)) continue
            if (!/\bconsole\.log\s*\(/.test(content)) continue
            findings.push(
              createFinding({
                ruleId: 'example.no-console-log',
                title: 'console.log in application code',
                severity: 'medium',
                confidence: 'confirmed',
                message: 'Introduced console.log in application code',
                file: file.path,
                line,
                evidence: { currentSnippet: content.trim().slice(0, 160) },
                remediation: 'Remove console.log or replace with a structured logger gated by environment.',
              }),
            )
          }
        }
        return findings
      },
    }),
  ],
})
