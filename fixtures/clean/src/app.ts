import express from 'express'

export function createApp() {
  const app = express()
  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })
  return app
}
