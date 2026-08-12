import type {
  Confidence,
  Finding,
  NormalizedDiff,
  ProjectModel,
  Severity,
} from '../core/types.js'
import type { Policy } from '../policy/schema.js'

export interface ProjectContext {
  project: ProjectModel
  policy: Policy
}

export interface RuleContext extends ProjectContext {
  diff: NormalizedDiff
}

export interface Rule {
  id: string
  title: string
  category: string
  severity: Severity
  confidence: Confidence
  supports(context: ProjectContext): boolean
  run(context: RuleContext): Promise<Finding[]>
}

let findingCounter = 0
export function makeFinding(
  rule: Pick<Rule, 'id' | 'title' | 'category' | 'severity' | 'confidence'>,
  partial: Omit<Finding, 'id' | 'ruleId' | 'title' | 'category' | 'severity' | 'confidence'> &
    Partial<Pick<Finding, 'severity' | 'confidence'>>,
): Finding {
  findingCounter += 1
  return {
    id: `${rule.id}-${findingCounter}`,
    ruleId: rule.id,
    title: rule.title,
    category: rule.category,
    severity: partial.severity ?? rule.severity,
    confidence: partial.confidence ?? rule.confidence,
    message: partial.message,
    file: partial.file,
    line: partial.line,
    evidence: partial.evidence,
    remediation: partial.remediation,
  }
}

export function resetFindingCounter(): void {
  findingCounter = 0
}
