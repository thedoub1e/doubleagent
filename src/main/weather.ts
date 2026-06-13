// 纯函数（无网络 / electron）：Open-Meteo 免费无密钥天气的 URL 拼装 + 响应解析 + 关心文案。
// 联网取数在 weatherNet.ts。Open-Meteo: 完全免费、无需 API key、自带城市地理编码。

export interface Geo {
  name: string
  latitude: number
  longitude: number
}

export interface DailyWeather {
  code: number // WMO weather code
  tempMax: number
  tempMin: number
  precipProb: number // 当日最大降水概率 %
  currentTemp: number | null
}

const GEOCODE_BASE = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast'
// IP 定位：免费无密钥；lang=zh-CN 直接给中文地名（如 马德里/西班牙）。仅 HTTP（免费档），
// 主进程 fetch 不受 CSP 限制；只在用户没手填城市时用，自动按网络位置播报天气。
const IP_GEO_URL = 'http://ip-api.com/json/?lang=zh-CN&fields=status,message,country,city,lat,lon'

export function buildIpGeoUrl(): string {
  return IP_GEO_URL
}

// 按输入文字选地理编码语言：含中日韩字 → zh，否则 → en。
// （实测 language=zh 会把英文城市名错配，如 "New York"→约克(内布拉斯加)；language=en 又匹配不到中文名。）
export function geocodeLanguage(city: string): 'zh' | 'en' {
  return /[一-鿿぀-ヿ가-힯]/.test(city) ? 'zh' : 'en'
}

export function buildGeocodeUrl(city: string): string {
  const lang = geocodeLanguage(city)
  return `${GEOCODE_BASE}?name=${encodeURIComponent(city)}&count=1&language=${lang}&format=json`
}

export function buildForecastUrl(lat: number, lon: number): string {
  const params =
    `latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&timezone=auto&forecast_days=1'
  return `${FORECAST_BASE}?${params}`
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** 解析地理编码响应，取首个结果。无结果 / 字段缺失返回 null。 */
export function parseGeocode(json: unknown): Geo | null {
  const results = (json as { results?: unknown })?.results
  if (!Array.isArray(results) || results.length === 0) return null
  const r = results[0] as Record<string, unknown>
  const lat = num(r.latitude)
  const lon = num(r.longitude)
  if (lat === null || lon === null) return null
  const name = typeof r.name === 'string' ? r.name : ''
  return { name, latitude: lat, longitude: lon }
}

/** 解析 ip-api.com 定位响应。status≠success / 经纬度缺失返回 null；名字优先城市、退国家。 */
export function parseIpGeo(json: unknown): Geo | null {
  const o = json as Record<string, unknown>
  if (!o || o.status !== 'success') return null
  const lat = num(o.lat)
  const lon = num(o.lon)
  if (lat === null || lon === null) return null
  const city = typeof o.city === 'string' ? o.city : ''
  const country = typeof o.country === 'string' ? o.country : ''
  const name = city || country
  if (name.length === 0) return null
  return { name, latitude: lat, longitude: lon }
}

/** 解析预报响应的「今天」。关键字段缺失返回 null。 */
export function parseForecast(json: unknown): DailyWeather | null {
  const o = json as { daily?: Record<string, unknown>; current?: Record<string, unknown> }
  const daily = o?.daily
  if (!daily) return null
  const code = num((daily.weather_code as unknown[])?.[0])
  const tempMax = num((daily.temperature_2m_max as unknown[])?.[0])
  const tempMin = num((daily.temperature_2m_min as unknown[])?.[0])
  if (code === null || tempMax === null || tempMin === null) return null
  const precip = num((daily.precipitation_probability_max as unknown[])?.[0])
  const cur = num(o.current?.temperature_2m)
  return {
    code,
    tempMax,
    tempMin,
    precipProb: precip ?? 0,
    currentTemp: cur
  }
}

// WMO weather code → 中文（取常见档；区间归并）。
const CODE_TEXT: Array<[number[], string]> = [
  [[0], '晴'],
  [[1, 2], '多云'],
  [[3], '阴'],
  [[45, 48], '有雾'],
  [[51, 53, 55, 56, 57], '小雨'],
  [[61, 63, 80, 81], '有雨'],
  [[65, 82], '大雨'],
  [[66, 67], '冻雨'],
  [[71, 73, 77, 85], '小雪'],
  [[75, 86], '大雪'],
  [[95, 96, 99], '雷雨']
]

export function weatherCodeText(code: number): string {
  for (const [codes, text] of CODE_TEXT) {
    if (codes.includes(code)) return text
  }
  return '多云'
}

/** 是否有降水（雨/雪/雷雨/冻雨）→ 需要带伞。 */
export function isRainy(code: number): boolean {
  return (code >= 51 && code <= 86) || (code >= 95 && code <= 99)
}

const RAIN_PROB_THRESHOLD = 50
const COLD_MIN = 5
const HOT_MAX = 32
const TEMP_SWING = 10

/** 体贴提醒短句（最多两条，免唠叨）。 */
export function weatherAdvice(w: DailyWeather): string[] {
  const tips: string[] = []
  if (isRainy(w.code) || w.precipProb >= RAIN_PROB_THRESHOLD) tips.push('记得带伞☔')
  if (w.tempMin <= COLD_MIN) tips.push('挺冷的，多穿点保暖呀🧣')
  else if (w.tempMax >= HOT_MAX) tips.push('有点热，注意防晒补水💧')
  else if (w.tempMax - w.tempMin >= TEMP_SWING) tips.push('今天温差大，记得加件外套👚')
  return tips.slice(0, 2)
}

/** 合成早安简报里的天气行。 */
export function composeWeatherLine(city: string, w: DailyWeather): string {
  const head = `天气🌤 ${city}今天${weatherCodeText(w.code)}，${Math.round(w.tempMin)}~${Math.round(w.tempMax)}°`
  const tips = weatherAdvice(w)
  return tips.length > 0 ? `${head}。${tips.join('，')}` : `${head}。`
}
