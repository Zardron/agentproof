import type { Finding, ReportModel, Severity } from '../core/types.js'
import { getVersion } from '../core/version.js'

function sarifLevel(severity: Severity): 'error' | 'warning' | 'note' {
  if (severity === 'critical' || severity === 'high') return 'error'
  if (severity === 'medium') return 'warning'
  return 'note'
}

export function formatSarif(report: ReportModel): string {
  const rules = new Map<string, Finding>()
  for (const f of report.findings) {
    if (!rules.has(f.ruleId)) rules.set(f.ruleId, f)
  }

  const sarif = {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'AgentProof',
            informationUri: 'https://github.com/agentproof/agentproof',
            version: getVersion(),
            rules: [...rules.values()].map((f) => ({
              id: f.ruleId,
              name: f.title,
              shortDescription: { text: f.title },
              fullDescription: { text: f.message },
              defaultConfiguration: {
                level: sarifLevel(f.severity),
              },
              properties: {
                category: f.category,
                confidence: f.confidence,
              },
            })),
          },
        },
        results: report.findings.map((f) => ({
          ruleId: f.ruleId,
          level: sarifLevel(f.severity),
          message: { text: f.message },
          locations: f.file
            ? [
                {
                  physicalLocation: {
                    artifactLocation: { uri: f.file },
                    region: f.line ? { startLine: f.line } : undefined,
                  },
                },
              ]
            : [],
          properties: {
            confidence: f.confidence,
            evidence: f.evidence,
          },
        })),
      },
    ],
  }

  return JSON.stringify(sarif, null, 2)
}
