import { describe, expect, test } from 'vitest'
import { renderMarkdown } from '../src/renderer/src/chat/markdown'

describe('renderMarkdown', () => {
  test('escapes HTML to prevent injection', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  test('renders bold and italic', () => {
    expect(renderMarkdown('**hi**')).toContain('<strong>hi</strong>')
    expect(renderMarkdown('_hi_')).toContain('<em>hi</em>')
  })

  test('renders inline code', () => {
    expect(renderMarkdown('use `npm start`')).toContain('<code>npm start</code>')
  })

  test('renders unordered list', () => {
    const html = renderMarkdown('- a\n- b')
    expect(html).toContain('<ul class="md-ul">')
    expect(html).toContain('<li>a</li>')
    expect(html).toContain('<li>b</li>')
  })

  test('renders ordered list', () => {
    const html = renderMarkdown('1. first\n2. second')
    expect(html).toContain('<ol class="md-ol">')
    expect(html).toContain('<li>first</li>')
  })

  test('renders fenced code block', () => {
    const html = renderMarkdown('```\nconst x = 1\n```')
    expect(html).toContain('<pre class="md-pre"><code>')
    expect(html).toContain('const x = 1')
  })

  test('renders headings', () => {
    expect(renderMarkdown('## Title')).toContain('<h2 class="md-h">Title</h2>')
  })

  test('renders only http links as md-link', () => {
    const html = renderMarkdown('[site](https://example.com)')
    expect(html).toContain('data-href="https://example.com"')
    expect(html).toContain('class="md-link"')
  })

  test('does not linkify non-http schemes', () => {
    const html = renderMarkdown('[x](javascript:alert(1))')
    expect(html).not.toContain('md-link')
  })

  test('wraps plain line in paragraph', () => {
    expect(renderMarkdown('hello')).toBe('<p class="md-p">hello</p>')
  })
})
