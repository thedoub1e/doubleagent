// 模型源预设（main 与 renderer 共享）。model id 来自 pi-ai 实测。
// kind='pi'：pi-ai 内置 provider，getModel(piProvider, model)。
// kind='openai-compatible'：自建 Model 走自定义 baseURL（通义 / Gemini 反代）。

export interface ProviderPreset {
  id: string
  label: string
  kind: 'pi' | 'openai-compatible'
  piProvider?: string
  defaultBaseUrl?: string
  models: string[]
  // 自建 OpenAI 兼容源是否支持看图（pi 内置源的能力由 pi-ai 的 model.input 决定，无需此标记）。
  vision?: boolean
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'minimax-cn', label: 'MiniMax · 国内', kind: 'pi', piProvider: 'minimax-cn', models: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed'] },
  { id: 'minimax', label: 'MiniMax · 国际', kind: 'pi', piProvider: 'minimax', models: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed'] },
  { id: 'deepseek', label: 'DeepSeek', kind: 'pi', piProvider: 'deepseek', models: ['deepseek-v4-pro', 'deepseek-v4-flash'] },
  { id: 'zai', label: '智谱 GLM · 国际', kind: 'pi', piProvider: 'zai', models: ['glm-5.1', 'glm-4.7', 'glm-5-turbo'] },
  { id: 'zai-coding-cn', label: '智谱 GLM · 国内', kind: 'pi', piProvider: 'zai-coding-cn', models: ['glm-5.1', 'glm-4.7', 'glm-5-turbo'] },
  { id: 'moonshotai', label: 'Kimi · 国际', kind: 'pi', piProvider: 'moonshotai', models: ['kimi-k2.6', 'kimi-k2.5', 'kimi-k2-thinking'] },
  { id: 'moonshotai-cn', label: 'Kimi · 国内', kind: 'pi', piProvider: 'moonshotai-cn', models: ['kimi-k2.6', 'kimi-k2.5', 'kimi-k2-thinking'] },
  { id: 'qwen', label: '通义千问 · OpenAI 兼容', kind: 'openai-compatible', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-plus', 'qwen-max', 'qwen-turbo'] },
  { id: 'gemini-proxy', label: 'Gemini 反代 · OpenAI 格式', kind: 'openai-compatible', defaultBaseUrl: '', models: ['gemini-2.5-flash', 'gemini-2.5-pro'], vision: true }
]

export function findPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id)
}
