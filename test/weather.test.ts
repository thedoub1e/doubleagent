import { describe, expect, test } from 'vitest'
import {
  buildForecastUrl,
  buildGeocodeUrl,
  buildIpGeoUrl,
  composeWeatherLine,
  geocodeLanguage,
  isRainy,
  parseForecast,
  parseGeocode,
  parseIpGeo,
  weatherAdvice,
  weatherCodeText,
  type DailyWeather
} from '../src/main/weather'

const w = (over: Partial<DailyWeather> = {}): DailyWeather => ({
  code: 0,
  tempMax: 20,
  tempMin: 14,
  precipProb: 0,
  currentTemp: 18,
  ...over
})

describe('URL 拼装', () => {
  test('geocode 对城市名做 URL 编码', () => {
    expect(buildGeocodeUrl('New York')).toContain('name=New%20York')
    expect(buildGeocodeUrl('北京')).toContain(encodeURIComponent('北京'))
  })
  test('按输入文字选地理编码语言（中文→zh，英文→en，避免英文名被错配）', () => {
    expect(geocodeLanguage('北京')).toBe('zh')
    expect(geocodeLanguage('東京')).toBe('zh')
    expect(geocodeLanguage('New York')).toBe('en')
    expect(buildGeocodeUrl('New York')).toContain('language=en')
    expect(buildGeocodeUrl('北京')).toContain('language=zh')
  })
  test('forecast 带经纬度与所需字段', () => {
    const url = buildForecastUrl(40.7, -74)
    expect(url).toContain('latitude=40.7')
    expect(url).toContain('longitude=-74')
    expect(url).toContain('temperature_2m_max')
    expect(url).toContain('precipitation_probability_max')
  })
})

describe('parseGeocode', () => {
  test('取首个结果的经纬度与名字', () => {
    const json = { results: [{ name: '纽约', latitude: 40.71, longitude: -74.01 }] }
    expect(parseGeocode(json)).toEqual({ name: '纽约', latitude: 40.71, longitude: -74.01 })
  })
  test('无结果 / 字段缺失 → null', () => {
    expect(parseGeocode({ results: [] })).toBeNull()
    expect(parseGeocode({})).toBeNull()
    expect(parseGeocode({ results: [{ name: 'x' }] })).toBeNull()
  })
})

describe('IP 定位', () => {
  test('buildIpGeoUrl 带中文语言 + 经纬度字段', () => {
    const url = buildIpGeoUrl()
    expect(url).toContain('lang=zh-CN')
    expect(url).toContain('lat')
    expect(url).toContain('lon')
  })
  test('parseIpGeo: success 取中文城市 + 经纬度', () => {
    const json = { status: 'success', country: '西班牙', city: '马德里', lat: 40.42, lon: -3.7 }
    expect(parseIpGeo(json)).toEqual({ name: '马德里', latitude: 40.42, longitude: -3.7 })
  })
  test('parseIpGeo: 无城市时退国家名', () => {
    expect(parseIpGeo({ status: 'success', country: '中国', city: '', lat: 39.9, lon: 116.4 })).toEqual({
      name: '中国',
      latitude: 39.9,
      longitude: 116.4
    })
  })
  test('parseIpGeo: 失败 / 缺经纬度 → null', () => {
    expect(parseIpGeo({ status: 'fail', message: 'private range' })).toBeNull()
    expect(parseIpGeo({ status: 'success', city: '某地' })).toBeNull()
    expect(parseIpGeo({})).toBeNull()
  })
})

describe('parseForecast', () => {
  test('取今天的 code / 温度 / 降水概率 / 当前温度', () => {
    const json = {
      current: { temperature_2m: 17.2 },
      daily: {
        weather_code: [61],
        temperature_2m_max: [22.4],
        temperature_2m_min: [13.1],
        precipitation_probability_max: [80]
      }
    }
    expect(parseForecast(json)).toEqual({
      code: 61,
      tempMax: 22.4,
      tempMin: 13.1,
      precipProb: 80,
      currentTemp: 17.2
    })
  })
  test('缺关键字段 → null；缺降水概率 → 默认 0', () => {
    expect(parseForecast({})).toBeNull()
    expect(parseForecast({ daily: { weather_code: [0] } })).toBeNull()
    const partial = parseForecast({
      daily: { weather_code: [0], temperature_2m_max: [20], temperature_2m_min: [10] }
    })
    expect(partial?.precipProb).toBe(0)
    expect(partial?.currentTemp).toBeNull()
  })
})

describe('weatherCodeText / isRainy', () => {
  test('code → 中文', () => {
    expect(weatherCodeText(0)).toBe('晴')
    expect(weatherCodeText(61)).toBe('有雨')
    expect(weatherCodeText(95)).toBe('雷雨')
    expect(weatherCodeText(999)).toBe('多云') // 未知归多云
  })
  test('降水判定', () => {
    expect(isRainy(0)).toBe(false)
    expect(isRainy(61)).toBe(true)
    expect(isRainy(75)).toBe(true)
    expect(isRainy(95)).toBe(true)
  })
})

describe('weatherAdvice', () => {
  test('下雨 → 带伞', () => {
    expect(weatherAdvice(w({ code: 61 }))).toContain('记得带伞☔')
  })
  test('高降水概率 → 带伞（即便 code 晴）', () => {
    expect(weatherAdvice(w({ code: 0, precipProb: 60 }))).toContain('记得带伞☔')
  })
  test('冷 / 热 / 温差互斥择一', () => {
    expect(weatherAdvice(w({ tempMin: 2, tempMax: 8 }))[0]).toContain('保暖')
    expect(weatherAdvice(w({ tempMin: 26, tempMax: 35 })).some((t) => t.includes('防晒'))).toBe(true)
    expect(weatherAdvice(w({ tempMin: 10, tempMax: 24 })).some((t) => t.includes('温差'))).toBe(true)
  })
  test('最多两条', () => {
    expect(weatherAdvice(w({ code: 61, tempMin: 1, tempMax: 6 })).length).toBeLessThanOrEqual(2)
  })
})

describe('composeWeatherLine', () => {
  test('含城市 / 天气 / 温度区间 / 提醒', () => {
    const line = composeWeatherLine('纽约', w({ code: 61, tempMin: 13.1, tempMax: 22.4, precipProb: 80 }))
    expect(line).toContain('纽约')
    expect(line).toContain('有雨')
    expect(line).toContain('13~22°')
    expect(line).toContain('带伞')
  })
  test('无提醒时以句号收尾', () => {
    expect(composeWeatherLine('东京', w({ code: 0, tempMin: 16, tempMax: 22 }))).toMatch(/。$/)
  })
})
