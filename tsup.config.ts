import { rmSync } from 'node:fs'
import { defineConfig } from 'tsup'

rmSync('dist', { recursive: true, force: true })

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm'],
    target: 'node20',
    outDir: 'dist',
    clean: false,
    sourcemap: true,
    dts: true,
    splitting: false,
    shims: false,
  },
  {
    entry: {
      'cli/index': 'src/cli/index.ts',
    },
    format: ['esm'],
    target: 'node20',
    outDir: 'dist',
    clean: false,
    sourcemap: true,
    dts: false,
    splitting: false,
    shims: false,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
])
