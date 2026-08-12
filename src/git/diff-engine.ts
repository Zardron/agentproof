import fs from 'node:fs'
import path from 'node:path'
import parseDiff from 'parse-diff'
import { simpleGit } from 'simple-git'
import type { DiffFile, DiffHunk, NormalizedDiff } from '../core/types.js'
import { classifyPath } from './classify.js'

function detectLanguage(filePath: string): DiffFile['language'] {
  if (/\.tsx?$/.test(filePath)) return 'typescript'
  if (/\.jsx?$/.test(filePath) || /\.mjs$/.test(filePath) || /\.cjs$/.test(filePath)) {
    return 'javascript'
  }
  if (filePath.endsWith('.json')) return 'json'
  if (/(^|\/)\.env/.test(filePath)) return 'env'
  return 'other'
}

function mapStatus(file: parseDiff.File): DiffFile['status'] {
  if (file.new) return 'A'
  if (file.deleted) return 'D'
  if (file.from && file.to && file.from !== file.to) return 'R'
  return 'M'
}

async function gitShow(
  cwd: string,
  ref: string,
  filePath: string,
): Promise<string> {
  try {
    const git = simpleGit(cwd)
    return await git.show([`${ref}:${filePath}`])
  } catch {
    return ''
  }
}

function readWorkingTree(cwd: string, filePath: string): string {
  try {
    return fs.readFileSync(path.join(cwd, filePath), 'utf8')
  } catch {
    return ''
  }
}

export async function computeDiff(options: {
  cwd: string
  base?: string
  revision?: string
  staged: boolean
}): Promise<NormalizedDiff> {
  const git = simpleGit(options.cwd)
  const isRepo = await git.checkIsRepo()
  if (!isRepo) {
    return {
      baseRef: 'none',
      headRef: 'workdir',
      files: [],
      staged: options.staged,
    }
  }

  let baseRef = options.base ?? 'HEAD'
  let headRef = 'WORKDIR'
  let raw = ''

  if (options.staged) {
    raw = await git.diff(['--cached', '--no-color'])
    baseRef = 'HEAD'
    headRef = 'STAGED'
  } else if (options.revision) {
    // e.g. HEAD~1 means compare HEAD~1..HEAD
    raw = await git.diff([`${options.revision}..HEAD`, '--no-color'])
    baseRef = options.revision
    headRef = 'HEAD'
  } else if (options.base) {
    raw = await git.diff([`${options.base}...HEAD`, '--no-color'])
    // also include unstaged working tree vs HEAD when comparing base for local runs
    const unstaged = await git.diff(['--no-color'])
    const staged = await git.diff(['--cached', '--no-color'])
    raw = [raw, staged, unstaged].filter(Boolean).join('\n')
    baseRef = options.base
    headRef = 'WORKDIR'
  } else {
    // default: unstaged + staged vs HEAD
    const unstaged = await git.diff(['--no-color'])
    const staged = await git.diff(['--cached', '--no-color'])
    raw = [staged, unstaged].filter(Boolean).join('\n')
    if (!raw.trim()) {
      // fall back to last commit
      raw = await git.diff(['HEAD~1..HEAD', '--no-color']).catch(() => '')
      baseRef = 'HEAD~1'
      headRef = 'HEAD'
    }
  }

  const parsed = parseDiff(raw)
  const files: DiffFile[] = []

  for (const file of parsed) {
    const filePath = (file.to !== '/dev/null' && file.to ? file.to : file.from) || 'unknown'
    if (filePath === '/dev/null') continue

    const hunks: DiffHunk[] = (file.chunks || []).map((chunk) => ({
      oldStart: chunk.oldStart,
      newStart: chunk.newStart,
      lines: chunk.changes.map((change) => {
        if (change.type === 'add') {
          return {
            type: 'add' as const,
            content: change.content.replace(/^\+/, ''),
            newLineNumber: change.ln,
          }
        }
        if (change.type === 'del') {
          return {
            type: 'del' as const,
            content: change.content.replace(/^-/, ''),
            oldLineNumber: change.ln,
          }
        }
        return {
          type: 'normal' as const,
          content: change.content.replace(/^ /, ''),
          oldLineNumber: 'ln1' in change ? change.ln1 : undefined,
          newLineNumber: 'ln2' in change ? change.ln2 : undefined,
        }
      }),
    }))

    const status = mapStatus(file)
    let baseContent = ''
    let currentContent = ''

    if (status !== 'A') {
      baseContent = await gitShow(options.cwd, baseRef === 'WORKDIR' ? 'HEAD' : baseRef, file.from || filePath)
    }
    if (status !== 'D') {
      currentContent = readWorkingTree(options.cwd, filePath)
      if (!currentContent && headRef === 'HEAD') {
        currentContent = await gitShow(options.cwd, 'HEAD', filePath)
      }
    }

    files.push({
      path: filePath.replace(/^\.\//, ''),
      oldPath: file.from && file.from !== filePath ? file.from : undefined,
      status,
      language: detectLanguage(filePath),
      riskDomains: classifyPath(filePath),
      hunks,
      baseContent,
      currentContent,
    })
  }

  // de-dupe by path (last wins)
  const byPath = new Map<string, DiffFile>()
  for (const f of files) byPath.set(f.path, f)

  return {
    baseRef,
    headRef,
    files: [...byPath.values()],
    staged: options.staged,
  }
}

export function addedLines(file: DiffFile): Array<{ line: number; content: string }> {
  const out: Array<{ line: number; content: string }> = []
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'add') {
        out.push({ line: line.newLineNumber ?? hunk.newStart, content: line.content })
      }
    }
  }
  return out
}

export function removedLines(file: DiffFile): Array<{ line: number; content: string }> {
  const out: Array<{ line: number; content: string }> = []
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'del') {
        out.push({ line: line.oldLineNumber ?? hunk.oldStart, content: line.content })
      }
    }
  }
  return out
}
