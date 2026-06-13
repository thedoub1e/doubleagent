// 天气联网层：Open-Meteo 免费无密钥接口。主进程 fetch（不受渲染层 CSP 约束），
// 带超时 + 城市坐标内存缓存。任何失败都安静返回 null（早安简报里就不出现天气行）。

import {
  buildForecastUrl,
  buildGeocodeUrl,
  buildIpGeoUrl,
  composeWeatherLine,
  parseForecast,
  parseGeocode,
  parseIpGeo,
  type Geo
} from './weather'

const TIMEOUT_MS = 6000
const geoCache = new Map<string, Geo>()
let ipGeoCache: Geo | null = null

async function getJson(url: string): Promise<unknown | null> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ac.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 城市名 → 经纬度（内存缓存，避免每天重复地理编码）。 */
async function resolveGeo(city: string): Promise<Geo | null> {
  const key = city.trim()
  if (key.length === 0) return null
  const cached = geoCache.get(key)
  if (cached) return cached
  const json = await getJson(buildGeocodeUrl(key))
  const geo = json ? parseGeocode(json) : null
  if (geo) geoCache.set(key, geo)
  return geo
}

/** 按 IP 自动定位（内存缓存：同一会话只查一次成功结果）。失败 → null。 */
async function resolveGeoByIp(): Promise<Geo | null> {
  if (ipGeoCache) return ipGeoCache
  const json = await getJson(buildIpGeoUrl())
  const geo = json ? parseIpGeo(json) : null
  if (geo) ipGeoCache = geo
  return geo
}

/** 取今天天气的关心文案。城市留空＝自动按 IP 定位；网络失败 / 无结果 → null。 */
export async function weatherLine(city: string): Promise<string | null> {
  const trimmed = city.trim()
  const geo = trimmed.length > 0 ? await resolveGeo(trimmed) : await resolveGeoByIp()
  if (!geo) return null
  const json = await getJson(buildForecastUrl(geo.latitude, geo.longitude))
  const w = json ? parseForecast(json) : null
  if (!w) return null
  return composeWeatherLine(geo.name || trimmed || '当前位置', w)
}
