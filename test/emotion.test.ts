import { describe, expect, test } from 'vitest'
import { emotionToPetState, parseEmotion } from '../src/shared/emotion'

describe('parseEmotion', () => {
  test('剥掉开头的已知情绪标签并返回情绪', () => {
    expect(parseEmotion('[开心] 太好啦！')).toEqual({ emotion: 'happy', clean: '太好啦！' })
    expect(parseEmotion('[兴奋]冲鸭')).toEqual({ emotion: 'excited', clean: '冲鸭' })
    expect(parseEmotion('  [思考]  嗯…让我想想')).toEqual({ emotion: 'thinking', clean: '嗯…让我想想' })
  })

  test('未知方括号原样保留（不吃 Markdown 链接 / 普通方括号）', () => {
    const link = '[Google](https://google.com) 这里'
    expect(parseEmotion(link)).toEqual({ emotion: null, clean: link })
    expect(parseEmotion('[TODO] 待办')).toEqual({ emotion: null, clean: '[TODO] 待办' })
  })

  test('没有标签时原样返回', () => {
    expect(parseEmotion('就是普通一句话')).toEqual({ emotion: null, clean: '就是普通一句话' })
  })

  test('只在开头匹配，正文里的标签不动', () => {
    const r = parseEmotion('[开心] 我[爱你]哦')
    expect(r.emotion).toBe('happy')
    expect(r.clean).toBe('我[爱你]哦')
  })

  test('流式途中标签未闭合 → 暂不剥（不误伤）', () => {
    expect(parseEmotion('[开')).toEqual({ emotion: null, clean: '[开' })
  })
})

describe('emotionToPetState', () => {
  test('兴奋→attention，思考→thinking，其余→reply', () => {
    expect(emotionToPetState('excited')).toBe('attention')
    expect(emotionToPetState('thinking')).toBe('thinking')
    expect(emotionToPetState('happy')).toBe('reply')
    expect(emotionToPetState('love')).toBe('reply')
    expect(emotionToPetState('sad')).toBe('reply')
    expect(emotionToPetState('comfort')).toBe('reply')
    expect(emotionToPetState('calm')).toBe('reply')
  })
})
