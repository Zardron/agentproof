import { describe, expect, it } from 'vitest'
import {
  describeProject,
  getVersion,
  loadPolicy,
  runPipeline,
} from '../../src/index.js'

describe('public API', () => {
  it('exports runnable pipeline helpers', async () => {
    expect(typeof runPipeline).toBe('function')
    expect(typeof getVersion).toBe('function')
    expect(typeof loadPolicy).toBe('function')
    expect(typeof describeProject).toBe('function')
    expect(getVersion()).toBe('0.4.1')
  })
})
