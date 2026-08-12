const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"\n;]+?\s+from\s+)?['"](\.[^'"]+)['"]/g
const REQUIRE_RE = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g

/** Relative import specifiers only — package names are ignored. */
export function parseRelativeImports(source: string): string[] {
  const found = new Set<string>()
  for (const re of [IMPORT_RE, REQUIRE_RE]) {
    re.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(source))) {
      if (match[1]) found.add(match[1])
    }
  }
  return [...found]
}
