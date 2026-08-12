import path from 'node:path'
import type { RiskDomain } from '../core/types.js'

const RULES: Array<{ domain: RiskDomain; patterns: RegExp[] }> = [
  {
    domain: 'authentication',
    patterns: [/auth/i, /login/i, /session/i, /passport/i, /oauth/i, /jwt/i],
  },
  {
    domain: 'authorization',
    patterns: [/authz/i, /permission/i, /rbac/i, /acl/i, /guard/i, /roles?/i],
  },
  {
    domain: 'payments',
    patterns: [/payment/i, /stripe/i, /checkout/i, /paypal/i],
  },
  {
    domain: 'billing',
    patterns: [/billing/i, /invoice/i, /subscription/i],
  },
  {
    domain: 'customer_data',
    patterns: [/pii/i, /gdpr/i, /customer/i, /userdata/i],
  },
  {
    domain: 'migrations',
    patterns: [/migrations?\//i, /prisma\/migrations/i],
  },
  {
    domain: 'database',
    patterns: [/prisma/i, /drizzle/i, /typeorm/i, /sequelize/i, /\/db\//i, /repository/i],
  },
  {
    domain: 'environment_config',
    patterns: [/^\.env/i, /config\./i, /environment/i],
  },
  {
    domain: 'api_routes',
    patterns: [/routes?\//i, /controllers?\//i, /api\//i, /handlers?\//i],
  },
  {
    domain: 'infrastructure',
    patterns: [/docker/i, /k8s/i, /terraform/i, /infra/i],
  },
  {
    domain: 'deployment',
    patterns: [/\.github\/workflows/i, /deploy/i, /vercel/i, /netlify/i],
  },
  {
    domain: 'dependencies',
    patterns: [/package\.json$/i, /pnpm-lock/i, /yarn\.lock/i, /package-lock/i, /bun\.lock/i],
  },
  {
    domain: 'build_tooling',
    patterns: [/tsconfig/i, /webpack/i, /vite\.config/i, /esbuild/i],
  },
  {
    domain: 'tests',
    patterns: [/\.test\./i, /\.spec\./i, /__tests__/i, /\/tests?\//i],
  },
  {
    domain: 'documentation',
    patterns: [/\.md$/i, /docs\//i, /README/i],
  },
  {
    domain: 'frontend_only',
    patterns: [/components?\//i, /pages?\//i, /app\/.*\.(tsx|jsx)$/i, /styles?\//i],
  },
]

export function classifyPath(filePath: string): RiskDomain[] {
  const normalized = filePath.split(path.sep).join('/')
  const domains: RiskDomain[] = []
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(normalized))) {
      domains.push(rule.domain)
    }
  }
  if (domains.length === 0) domains.push('other')
  return [...new Set(domains)]
}

export function isHighRiskDomain(domain: RiskDomain): boolean {
  return [
    'authentication',
    'authorization',
    'payments',
    'billing',
    'customer_data',
    'database',
    'migrations',
    'environment_config',
    'infrastructure',
    'deployment',
    'dependencies',
  ].includes(domain)
}

export function isTestPath(filePath: string): boolean {
  const n = filePath.split(path.sep).join('/')
  return (
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(n) ||
    /(^|\/)__tests__\//.test(n) ||
    /(^|\/)tests?\//.test(n) ||
    /(^|\/)fixtures\//.test(n)
  )
}

/** Paths that should not produce production security findings. */
export function isNonProductionPath(filePath: string): boolean {
  const n = filePath.split(path.sep).join('/')
  return (
    isTestPath(n) ||
    /\.md$/i.test(n) ||
    /(^|\/)\.github\//.test(n) ||
    /(^|\/)scripts\//.test(n) ||
    /(^|\/)src\/rules\//.test(n) ||
    /(^|\/)action\.ya?ml$/.test(n)
  )
}
