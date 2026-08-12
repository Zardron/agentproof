import type { Finding } from '../core/types.js'

export interface AdvisoryPackage {
  name: string
  version: string
}

interface OsvSeverity {
  type?: string
  score?: string
}

interface OsvVuln {
  id?: string
  summary?: string
  details?: string
  severity?: OsvSeverity[]
  database_specific?: { severity?: string }
}

function stripRange(version: string): string {
  return version.replace(/^[\^~>=<\s]+/, '').split(' ')[0] ?? version
}

function mapSeverity(vuln: OsvVuln): Finding['severity'] {
  const labeled = vuln.database_specific?.severity?.toUpperCase()
  if (labeled === 'CRITICAL') return 'critical'
  if (labeled === 'HIGH') return 'high'
  if (labeled === 'MODERATE' || labeled === 'MEDIUM') return 'medium'
  if (labeled === 'LOW') return 'low'
  const cvss = vuln.severity?.find((s) => s.type === 'CVSS_V3' || s.type === 'CVSS_V4')
  const score = Number.parseFloat(cvss?.score ?? '')
  if (score >= 9) return 'critical'
  if (score >= 7) return 'high'
  if (score >= 4) return 'medium'
  if (Number.isFinite(score)) return 'low'
  return 'high'
}

export async function fetchAdvisoryFindings(
  packages: AdvisoryPackage[],
  enabled: boolean,
): Promise<Finding[]> {
  if (!enabled || packages.length === 0) return []

  const unique = new Map<string, AdvisoryPackage>()
  for (const pkg of packages) {
    unique.set(`${pkg.name}@${pkg.version}`, {
      name: pkg.name,
      version: stripRange(pkg.version),
    })
  }
  const queries = [...unique.values()].map((pkg) => ({
    package: { name: pkg.name, ecosystem: 'npm' },
    version: pkg.version,
  }))

  try {
    const response = await fetch('https://api.osv.dev/v1/querybatch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ queries }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return []
    const body = (await response.json()) as {
      results?: Array<{ vulns?: OsvVuln[] }>
    }
    const findings: Finding[] = []
    const pkgs = [...unique.values()]
    body.results?.forEach((result, index) => {
      const pkg = pkgs[index]
      for (const vuln of result.vulns ?? []) {
        const severity = mapSeverity(vuln)
        findings.push({
          id: `dep.advisory-${vuln.id ?? `${pkg?.name}-${index}`}`,
          ruleId: 'dep.advisory',
          title: 'Known vulnerability',
          category: 'dependencies',
          severity,
          confidence: 'high',
          message: `${pkg?.name}@${pkg?.version} has ${vuln.id ?? 'an advisory'}: ${vuln.summary ?? 'see OSV'}`,
          file: 'package.json',
          evidence: { currentSnippet: `${pkg?.name}@${pkg?.version}` },
          remediation: 'Upgrade to a patched version or accept the risk explicitly in policy.',
        })
      }
    })
    return findings
  } catch {
    return []
  }
}
