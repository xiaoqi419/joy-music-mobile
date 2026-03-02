/**
 * URL 工具：
 * 1. 统一处理协议缺失（// 或无协议）；
 * 2. 默认将 http 升级为 https，减少 iOS ATS 导致的资源加载失败；
 * 3. 提供封面 URL 的 size 占位符替换能力。
 */

interface NormalizeNetworkUrlOptions {
  forceHttps?: boolean
}

const INVALID_TEXT = new Set(['', 'undefined', 'null', 'none', 'nan'])

function normalizeText(raw: unknown): string {
  return String(raw ?? '').trim()
}

export function normalizeNetworkUrl(
  raw: unknown,
  options: NormalizeNetworkUrlOptions = {}
): string | undefined {
  const { forceHttps = true } = options
  const text = normalizeText(raw)
  if (!text) return undefined

  const lower = text.toLowerCase()
  if (INVALID_TEXT.has(lower)) return undefined

  if (text.startsWith('//')) {
    return `https:${text}`
  }

  if (/^https?:\/\//i.test(text)) {
    if (forceHttps) return text.replace(/^http:\/\//i, 'https://')
    return text
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    return text
  }

  if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(text)) {
    return `${forceHttps ? 'https' : 'http'}://${text}`
  }

  return text
}

export function normalizeImageUrl(
  raw: unknown,
  size?: number | string
): string | undefined {
  const normalized = normalizeNetworkUrl(raw, { forceHttps: true })
  if (!normalized) return undefined
  if (size === undefined || size === null) return normalized
  return normalized.replace('{size}', String(size))
}
