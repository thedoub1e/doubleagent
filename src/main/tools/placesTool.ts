// 位置推荐工具（Google Places API · Text Search v1）：附近好吃好玩/吃什么。
// 需要 config.mapsApiKey（赠予者一次性填）。位置=她设的城市 + IP 定位坐标做 locationBias。
import { loadConfig } from '../config'
import { buildIpGeoUrl, parseIpGeo } from '../weather'
import { truncateOutput } from './safety'
import type { ToolModule } from './types'

export interface Place {
  name: string
  address: string
  rating?: number
  reviews?: number
}

/** 解析 Places searchText 返回的 JSON → 地点列表。纯函数、可单测。 */
export function parsePlaces(json: unknown): Place[] {
  const places = (json as { places?: unknown[] })?.places
  if (!Array.isArray(places)) return []
  const out: Place[] = []
  for (const raw of places) {
    const p = raw as {
      displayName?: { text?: string }
      formattedAddress?: string
      rating?: number
      userRatingCount?: number
    }
    const name = p.displayName?.text
    if (!name) continue
    out.push({
      name,
      address: p.formattedAddress ?? '',
      rating: typeof p.rating === 'number' ? p.rating : undefined,
      reviews: typeof p.userRatingCount === 'number' ? p.userRatingCount : undefined
    })
  }
  return out
}

async function resolveArea(): Promise<{ area: string; lat?: number; lng?: number }> {
  const city = loadConfig().weatherCity.trim()
  try {
    const r = await fetch(buildIpGeoUrl(), { signal: AbortSignal.timeout(6000) })
    const geo = parseIpGeo(await r.json())
    if (geo) return { area: city || geo.name, lat: geo.latitude, lng: geo.longitude }
  } catch {
    // IP 定位失败 → 退回只用城市名
  }
  return { area: city }
}

export const findNearbyTool: ToolModule = {
  name: 'find_nearby',
  description:
    '推荐她附近的好吃好玩——餐厅/奶茶店/咖啡/超市/景点/公园等。' +
    '当她问「附近有什么好吃的/好玩的」「不知道吃什么」「附近的中国奶茶店」时用。',
  parameters: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description: '想找什么，如「中国奶茶店」「评价高的餐厅」「咖啡馆」「公园」；没说就用「附近好吃的」'
      }
    },
    required: ['keyword']
  },
  async run(args) {
    const key = loadConfig().mapsApiKey.trim()
    if (key.length === 0) {
      return '我还没配上地图密钥呢，让主人在设置里填一个 Google Maps 密钥就能帮你找附近啦～'
    }
    const kw = String(args.keyword ?? '').trim() || '附近好吃的'
    const loc = await resolveArea()
    const textQuery = loc.area ? `${loc.area} ${kw}` : kw
    const body: Record<string, unknown> = { textQuery, languageCode: 'zh-CN', maxResultCount: 8 }
    if (loc.lat != null && loc.lng != null) {
      body.locationBias = { circle: { center: { latitude: loc.lat, longitude: loc.lng }, radius: 3000 } }
    }
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        signal: AbortSignal.timeout(12_000),
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask':
            'places.displayName,places.formattedAddress,places.rating,places.userRatingCount'
        },
        body: JSON.stringify(body)
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        return `没查成功（地图接口 ${res.status}）${t.slice(0, 120)}`
      }
      const items = parsePlaces(await res.json())
      if (items.length === 0) return `附近暂时没搜到「${kw}」呢`
      const lines = items
        .map((p, i) => {
          const star = p.rating ? ` ⭐${p.rating}${p.reviews ? `（${p.reviews}条）` : ''}` : ''
          return `${i + 1}. ${p.name}${star}\n   ${p.address}`
        })
        .join('\n\n')
      return truncateOutput(lines, 2000)
    } catch (e) {
      return `查附近没成功：${(e as Error).message}（可能没联网或密钥没开 Places API）`
    }
  }
}
