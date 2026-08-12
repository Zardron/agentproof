import { exec } from 'node:child_process'
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

void cors
