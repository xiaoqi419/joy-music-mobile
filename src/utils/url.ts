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
const KUWO_LEGACY_IMAGE_HOST_RE = /^img(\d*)\.kwcdn\.kuwo\.cn$/i
const KUWO_LEGACY_IMAGE_URL_RE = /^https?:\/\/img(\d*)\.kwcdn\.kuwo\.cn(?=[:/]|$)/i
const HTTP_PREFERRED_AUDIO_HOSTS = [/^([a-z0-9-]+\.)*sycdn\.kuwo\.cn$/i]

function normalizeText(raw: unknown): string {
  return String(raw ?? '').trim()
}

function rewriteKuwoImageUrl(urlText: string): string {
  if (!urlText) return urlText

  const isLegacyHostOnly = KUWO_LEGACY_IMAGE_HOST_RE.test(urlText)
  if (isLegacyHostOnly) {
    const match = urlText.match(KUWO_LEGACY_IMAGE_HOST_RE)
    const shard = match?.[1] || '1'
    return `https://kwimg${shard}.kuwo.cn`
  }

  return urlText.replace(KUWO_LEGACY_IMAGE_URL_RE, (_full, shard: string) => {
    const targetShard = shard || '1'
    return `https://kwimg${targetShard}.kuwo.cn`
  })
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
  const rewritten = rewriteKuwoImageUrl(normalized)
  if (size === undefined || size === null) return rewritten
  return rewritten.replace('{size}', String(size))
}

function isHttpPreferredAudioHost(hostname: string): boolean {
  return HTTP_PREFERRED_AUDIO_HOSTS.some((rule) => rule.test(hostname))
}

function safeParseHttpUrl(raw: string): URL | null {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

export function normalizePlayableAudioUrl(raw: unknown): string | undefined {
  const normalized = normalizeNetworkUrl(raw, { forceHttps: false })
  if (!normalized) return undefined

  const parsed = safeParseHttpUrl(normalized)
  if (!parsed || !/^https?:$/i.test(parsed.protocol)) {
    return normalized
  }

  // Some audio CDNs (e.g. *.sycdn.kuwo.cn) fail TLS validation on iOS.
  // Force HTTPS -> HTTP for those hosts to keep playback/cache usable.
  if (parsed.protocol.toLowerCase() === 'https:' && isHttpPreferredAudioHost(parsed.hostname)) {
    parsed.protocol = 'http:'
    return parsed.toString()
  }

  return parsed.toString()
}

export function getPlayableAudioUrlCandidates(raw: unknown): string[] {
  const normalized = normalizePlayableAudioUrl(raw)
  if (!normalized) return []

  const parsed = safeParseHttpUrl(normalized)
  if (!parsed || !/^https?:$/i.test(parsed.protocol)) {
    return [normalized]
  }

  const protocol = parsed.protocol.toLowerCase()
  const hostname = parsed.hostname

  if (isHttpPreferredAudioHost(hostname)) {
    // Only try HTTP for known bad-certificate hosts to avoid repeated -1202.
    if (protocol === 'https:') parsed.protocol = 'http:'
    return [parsed.toString()]
  }

  if (protocol === 'http:') {
    const httpsUrl = normalized.replace(/^http:/i, 'https:')
    return Array.from(new Set([httpsUrl, normalized]))
  }

  const httpUrl = normalized.replace(/^https:/i, 'http:')
  return Array.from(new Set([normalized, httpUrl]))
}
