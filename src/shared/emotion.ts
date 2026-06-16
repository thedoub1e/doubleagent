// 情绪标签（amica `[emotion]` 思路）：模型在回复最开头标一个方括号情绪标签，
// 我们据此命中对应 gif 桶（比按关键词猜更准），并把标签从展示文本里剥掉。
// 纯函数、零依赖 → 主进程与渲染层共用，可单测。

export type Emotion = 'happy' | 'excited' | 'sad' | 'comfort' | 'thinking' | 'calm' | 'love'

// 桌宠形象状态（与 petAssets.PetState 同值；这里独立声明以保持 shared 零依赖）。
export type PetVisualState = 'idle' | 'thinking' | 'reply' | 'attention'

// 中文标签 → 情绪。只认这些已知标签，未知方括号一律不剥（避免吃掉 Markdown 链接 [text](url)）。
const TAG_TO_EMOTION: Record<string, Emotion> = {
  开心: 'happy',
  高兴: 'happy',
  笑: 'happy',
  兴奋: 'excited',
  激动: 'excited',
  加油: 'excited',
  难过: 'sad',
  伤心: 'sad',
  委屈: 'sad',
  安慰: 'comfort',
  心疼: 'comfort',
  思考: 'thinking',
  疑惑: 'thinking',
  平静: 'calm',
  淡定: 'calm',
  爱你: 'love',
  喜欢: 'love',
  比心: 'love'
}

/** 情绪 → emoji。用于把模型偶尔写进正文的情绪标签转成 emoji 展示（而非裸露方括号文本）。 */
const EMOTION_EMOJI: Record<Emotion, string> = {
  happy: '😊',
  excited: '🎉',
  sad: '😢',
  comfort: '🤗',
  thinking: '🤔',
  calm: '😌',
  love: '💗'
}

/** 注入人设的情绪标注指令（让模型每次回复以一个情绪标签开头）。 */
export const EMOTION_INSTRUCTION =
  '\n\n【情绪表达】每次回复请在最开头用一个方括号情绪标签标注你此刻的情绪，' +
  '从这些里选一个：[开心] [兴奋] [难过] [安慰] [思考] [平静] [爱你]，紧接着写正文。' +
  '例如「[开心] 太好啦！」。标签只放在开头、只出现一次。' +
  '正文里不要再写方括号情绪标签，但欢迎自然地用 emoji（😊🎉🐶💗🤗 等）让语气更生动温暖，别堆砌。'

const LEADING_TAG = /^\s*\[([^\]\n]{1,6})\]\s*/

// 正文里残留的已知情绪标签 → emoji（不吃 Markdown 链接 [text](url)：负向预查 `(`）。
const BODY_TAG = new RegExp(`\\[(${Object.keys(TAG_TO_EMOTION).join('|')})\\](?!\\()`, 'g')

/**
 * 把正文中残留的已知情绪标签（如模型违规写在句中的 `[爱你]`）转成对应 emoji。
 * 只认 TAG_TO_EMOTION 里的已知中文标签；未知方括号与 Markdown 链接一律不动。
 * 应在 parseEmotion 剥掉开头标签之后、对 clean 文本调用。
 */
export function decorateEmotionTags(text: string): string {
  return text.replace(BODY_TAG, (_m, tag: string) => EMOTION_EMOJI[TAG_TO_EMOTION[tag]])
}

/**
 * 解析回复开头的情绪标签。命中已知标签 → 返回该情绪并剥掉标签；
 * 否则原样返回（emotion=null），绝不动正文（含以 Markdown 链接开头的情况）。
 */
export function parseEmotion(text: string): { emotion: Emotion | null; clean: string } {
  const m = LEADING_TAG.exec(text)
  if (!m) return { emotion: null, clean: text }
  const emotion = TAG_TO_EMOTION[m[1].trim()]
  if (!emotion) return { emotion: null, clean: text }
  return { emotion, clean: text.slice(m[0].length) }
}

/** 情绪 → 形象状态桶。兴奋走「提醒/加油」能量桶，思考走思考桶，其余走回复桶。 */
export function emotionToPetState(emotion: Emotion): PetVisualState {
  switch (emotion) {
    case 'excited':
      return 'attention'
    case 'thinking':
      return 'thinking'
    default:
      return 'reply'
  }
}
