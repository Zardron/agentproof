import fs from 'node:fs'
import path from 'node:path'
import { EXIT_ERROR, EXIT_PASS } from '../core/exit-codes.js'
import { findExistingConfig } from './existing.js'
import {
  formatFromFileName,
  formatStarterConfig,
  inspectForInit,
} from './generate.js'

export class InitAbortedError extends Error {
  readonly exitCode = EXIT_ERROR

  constructor(message: string) {
    super(message)
    this.name = 'InitAbortedError'
  }
}

export interface InitOptions {
  cwd: string
  force: boolean
  interactive: boolean
  confirm?: (message: string) => Promise<boolean>
}

export interface InitResult {
  fileName: string
  overwritten: boolean
  detections: string[]
  output: string
  exitCode: number
}

function existsMessage(relativePath: string): string {
  if (relativePath === 'package.json') {
    return 'An AgentProof config already exists in package.json. Re-run with --force to write a dedicated config file, or remove the "agentproof" key first.'
  }
  return `${relativePath} already exists. Re-run with --force to overwrite.`
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const inspected = inspectForInit(options.cwd)
  const existing = findExistingConfig(options.cwd)

  if (existing && !options.force) {
    if (options.interactive && options.confirm) {
      const ok = await options.confirm(
        `${existing.relativePath} already exists. Overwrite? [y/N] `,
      )
      if (!ok) {
        throw new InitAbortedError(existsMessage(existing.relativePath))
      }
    } else {
      throw new InitAbortedError(existsMessage(existing.relativePath))
    }
  }

  let fileName = inspected.preferredFileName
  let overwritten = false

  if (existing?.kind === 'file') {
    fileName = existing.relativePath
    overwritten = true
  } else if (existing?.kind === 'package.json') {
    overwritten = true
  }

  const format = formatFromFileName(fileName)
  const contents = formatStarterConfig(inspected.config, format)
  const absolutePath = path.join(options.cwd, fileName)
  fs.writeFileSync(absolutePath, contents, 'utf8')

  const detections = inspected.detections.map((d) => d.label)
  const output = formatInitOutput({
    detections,
    fileName,
    overwritten,
  })

  return {
    fileName,
    overwritten,
    detections,
    output,
    exitCode: EXIT_PASS,
  }
}

export function formatInitOutput(options: {
  detections: string[]
  fileName: string
  overwritten: boolean
}): string {
  const lines = ['AgentProof Setup', '']
  for (const label of options.detections) {
    lines.push(`✓ Detected ${label}`)
  }
  lines.push('')
  lines.push(options.overwritten ? 'Updated:' : 'Created:')
  lines.push('')
  lines.push(options.fileName)
  lines.push('')
  lines.push('AgentProof is ready.')
  lines.push('')
  lines.push('Run:')
  lines.push('')
  lines.push('npx agentproof --base main')
  lines.push('')
  return lines.join('\n')
}

export function isInteractiveInit(options: {
  isTty: boolean
  env?: NodeJS.ProcessEnv
}): boolean {
  const env = options.env ?? process.env
  if (env.CI === 'true' || env.GITHUB_ACTIONS === 'true') return false
  return options.isTty
}
