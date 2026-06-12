import { describe, expect, test } from 'vitest'
import { PROVIDER_PRESETS, findPreset } from '../src/shared/providers'

describe('provider presets', () => {
  test('default MiniMax 国内 preset exists and is pi-kind', () => {
    const p = findPreset('minimax-cn')
    expect(p).toBeDefined()
    expect(p?.kind).toBe('pi')
    expect(p?.piProvider).toBe('minimax-cn')
    expect(p?.models).toContain('MiniMax-M3')
  })

  test('custom OpenAI-compatible presets carry a default baseUrl or empty', () => {
    const qwen = findPreset('qwen')
    expect(qwen?.kind).toBe('openai-compatible')
    expect(qwen?.defaultBaseUrl).toContain('dashscope')
    const gemini = findPreset('gemini-proxy')
    expect(gemini?.kind).toBe('openai-compatible')
    expect(gemini?.defaultBaseUrl).toBe('')
  })

  test('every preset has at least one model and a unique id', () => {
    const ids = new Set<string>()
    for (const p of PROVIDER_PRESETS) {
      expect(p.models.length).toBeGreaterThan(0)
      expect(ids.has(p.id)).toBe(false)
      ids.add(p.id)
      if (p.kind === 'pi') expect(p.piProvider).toBeTruthy()
    }
  })

  test('findPreset returns undefined for unknown id', () => {
    expect(findPreset('nope')).toBeUndefined()
  })
})
