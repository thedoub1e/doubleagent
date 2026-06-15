import { describe, expect, it } from 'vitest'
import { parsePlaces } from '../src/main/tools/placesTool'
import { ALL_TOOL_MODULES } from '../src/main/tools/index'

describe('parsePlaces (Google Places searchText v1)', () => {
  const sample = {
    places: [
      {
        displayName: { text: '幸福堂奶茶' },
        formattedAddress: 'Calle Mayor 1, Madrid',
        rating: 4.5,
        userRatingCount: 230
      },
      { displayName: { text: '无评分小店' }, formattedAddress: 'Gran Vía 2, Madrid' },
      { formattedAddress: '没名字应被跳过' }
    ]
  }
  it('抽出名称/地址/评分，跳过无名条目', () => {
    const r = parsePlaces(sample)
    expect(r).toHaveLength(2)
    expect(r[0]).toEqual({
      name: '幸福堂奶茶',
      address: 'Calle Mayor 1, Madrid',
      rating: 4.5,
      reviews: 230
    })
    expect(r[1].rating).toBeUndefined()
  })
  it('空/异常返回空数组', () => {
    expect(parsePlaces({})).toEqual([])
    expect(parsePlaces(null)).toEqual([])
    expect(parsePlaces({ places: 'x' })).toEqual([])
  })
})

describe('find_nearby 已注册进工具总集', () => {
  it('ALL_TOOL_MODULES 含 find_nearby', () => {
    expect(ALL_TOOL_MODULES.some((t) => t.name === 'find_nearby')).toBe(true)
  })
})
