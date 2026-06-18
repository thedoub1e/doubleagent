import { describe, expect, test } from 'vitest'
import { friendlyChatError } from '../src/main/chat'

describe('friendlyChatError', () => {
  test('模型/服务端 500 类错误 → 「没连上服务器」温和提示', () => {
    const raw = '500 {"type":"error","error":{"type":"api_error","message":"unknown error, 999 (1000)"}}'
    expect(friendlyChatError(raw)).toContain('没连上服务器')
    expect(friendlyChatError('502 Bad Gateway')).toContain('没连上服务器')
  })

  test('鉴权类错误（401 / invalid key）→ 提示检查 Key', () => {
    expect(friendlyChatError('401 Unauthorized')).toContain('Key')
    expect(friendlyChatError('invalid api key')).toContain('Key')
  })

  test('限流类（429 / rate limit）→ 让小狗喘口气', () => {
    expect(friendlyChatError('429 Too Many Requests')).toContain('喘口气')
    expect(friendlyChatError('rate limit exceeded')).toContain('喘口气')
  })

  test('网络类（timeout / ECONNREFUSED / fetch failed）→ 检查网络', () => {
    expect(friendlyChatError('connect ETIMEDOUT')).toContain('网络')
    expect(friendlyChatError('fetch failed')).toContain('网络')
  })

  test('已是中文短友好提示 → 原样透传', () => {
    const friendly = '还没填 API Key —— 点设置，粘贴你的 Key。'
    expect(friendlyChatError(friendly)).toBe(friendly)
  })

  test('未知英文/JSON 报错 → 温和兜底，绝不甩天书给用户', () => {
    const blob = '{"role":"assistant","stopReason":"error","weird":true}'
    const out = friendlyChatError(blob)
    expect(out).not.toContain('{')
    expect(out).toContain('🐶')
  })
})
