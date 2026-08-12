import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import cors from 'cors'

export const apiKey = 'hk_local_9f8e7d6c5b4a3210deadbeefcafebabe'

export function runUser(cmd: string) {
  eval(cmd)
  exec(cmd)
}

export function query(id: string) {
  return `SELECT * FROM users WHERE id = '${id}'`
}

export const httpsAgent = { rejectUnauthorized: false }

export const corsOptions = {
  origin: '*',
  credentials: true,
}

export function bounce(req: { query: { next?: string } }, res: { redirect: (u: string) => void }) {
  res.redirect(req.query.next ?? '/')
}

export function readUserFile(req: { params: { file: string } }) {
  return fs.readFileSync(path.join('/data', req.params.file), 'utf8')
}

export function saveUpload(req: { params: { name: string }; body: string }) {
  fs.writeFileSync(path.join('/uploads', req.params.name), req.body)
}

export function debugAuth(password: string) {
  console.log('login password', password)
}

void cors
