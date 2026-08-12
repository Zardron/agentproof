#!/usr/bin/env node
import { execSync } from 'node:child_process'
import fs from 'node:fs'

function parse(version) {
  return version.split('.').map((part) => Number.parseInt(part, 10) || 0)
}

function compare(a, b) {
  const left = parse(a)
  const right = parse(b)
  for (let i = 0; i < 3; i++) {
    if (left[i] > right[i]) return 1
    if (left[i] < right[i]) return -1
  }
  return 0
}

const current = JSON.parse(fs.readFileSync('package.json', 'utf8')).version
const baseRef = process.env.GITHUB_BASE_REF
  ? `origin/${process.env.GITHUB_BASE_REF}`
  : 'origin/main'

let baseVersion
try {
  const raw = execSync(`git show ${baseRef}:package.json`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  baseVersion = JSON.parse(raw).version
} catch {
  console.log(`No package.json on ${baseRef}; skipping version bump check.`)
  process.exit(0)
}

if (compare(current, baseVersion) <= 0) {
  console.error(
    `package.json version must increase on every PR. base=${baseVersion} current=${current}`,
  )
  process.exit(1)
}

console.log(`Version bump OK: ${baseVersion} → ${current}`)
