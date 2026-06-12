// 零依赖、可审计的极简 Markdown 渲染器。
// 安全策略：先整体 HTML 转义（杜绝模型输出里的原始 HTML 注入 / XSS），再套有限的格式。
// 支持：标题(#,##,###)、有序/无序列表、引用(>)、代码块(```)、行内 `代码` / **粗** / *斜* / [文本](http链接)。

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// 行内格式。输入已是 HTML 转义后的文本。
function inline(text: string): string {
  let out = text.replace(/`([^`]+)`/g, (_m, c: string) => `<code>${c}</code>`)
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>')
  out = out.replace(/(^|[^_])_([^_\s][^_]*?)_(?!_)/g, '$1<em>$2</em>')
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, t: string, u: string) => `<a class="md-link" data-href="${u}">${t}</a>`)
  return out
}

export function renderMarkdown(md: string): string {
  const lines = escapeHtml(md).split('\n')
  const html: string[] = []
  let inCode = false
  let codeBuf: string[] = []
  let listType: 'ul' | 'ol' | null = null

  const closeList = (): void => {
    if (listType) {
      html.push(`</${listType}>`)
      listType = null
    }
  }

  for (const line of lines) {
    if (/^```/.test(line)) {
      if (!inCode) {
        closeList()
        inCode = true
        codeBuf = []
      } else {
        html.push(`<pre class="md-pre"><code>${codeBuf.join('\n')}</code></pre>`)
        inCode = false
      }
      continue
    }
    if (inCode) {
      codeBuf.push(line)
      continue
    }
    if (line.trim() === '') {
      closeList()
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      closeList()
      const lvl = heading[1].length
      html.push(`<h${lvl} class="md-h">${inline(heading[2])}</h${lvl}>`)
      continue
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/)
    if (ul) {
      if (listType !== 'ul') {
        closeList()
        listType = 'ul'
        html.push('<ul class="md-ul">')
      }
      html.push(`<li>${inline(ul[1])}</li>`)
      continue
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/)
    if (ol) {
      if (listType !== 'ol') {
        closeList()
        listType = 'ol'
        html.push('<ol class="md-ol">')
      }
      html.push(`<li>${inline(ol[1])}</li>`)
      continue
    }

    const bq = line.match(/^>\s?(.*)$/)
    if (bq) {
      closeList()
      html.push(`<blockquote class="md-bq">${inline(bq[1])}</blockquote>`)
      continue
    }

    closeList()
    html.push(`<p class="md-p">${inline(line)}</p>`)
  }

  closeList()
  if (inCode) html.push(`<pre class="md-pre"><code>${codeBuf.join('\n')}</code></pre>`)
  return html.join('')
}
