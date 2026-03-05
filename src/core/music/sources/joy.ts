/**
 * Joy music source adapter.
 * Adapts /music/url API to Joy Music Mobile.
 */

import { MusicSourceAPI, Quality } from '../source'
import { ImportedMusicSource, MusicSourceSettingsSnapshot } from '../../config/musicSource'

const QUALITY_FALLBACK_ORDER: Quality[] = [
  'master',
  'atmos_plus',
  'atmos',
  'hires',
  'flac24bit',
  'flac',
  '320k',
  '128k',
]

const DEFAULT_PLATFORM_QUALITIES: Record<string, Quality[]> = {
  kw: ['128k', '320k', 'flac', 'flac24bit', 'hires'],
  wy: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
  tx: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master'],
  kg: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
  mg: ['128k', '320k', 'flac', 'flac24bit', 'hires'],
}

interface JoyMusicInfo {
  id?: string
  hash?: string
  songmid?: string
  name?: string
  singer?: string
  source?: string
  picUrl?: string
}

interface MusicUrlResponse {
  code?: number
  url?: string
  message?: string
  data?: any
  [key: string]: any
}

interface JoyRuntimeConfig {
  selectedSourceId: string
  autoSwitch: boolean
  importedSources: ImportedMusicSource[]
}

type RequestMethod = 'GET' | 'POST'

interface RequestPlan {
  method: RequestMethod
  pathTemplate: string
  bodyTemplate?: Record<string, string>
  apiKeyHeader?: string
}

export const NO_AVAILABLE_SOURCE_MESSAGE = '未配置可用音源，请先在“我的 > 自定义源管理”中导入并启用音源'

export class JoySourceUnavailableError extends Error {
  constructor(message: string = NO_AVAILABLE_SOURCE_MESSAGE) {
    super(message)
    this.name = 'JoySourceUnavailableError'
  }
}

const runtimeConfig: JoyRuntimeConfig = {
  selectedSourceId: '',
  autoSwitch: false,
  importedSources: [],
}
const sourcePlanCache = new Map<string, RequestPlan[]>()

/**
 * 同步运行时音源配置（来源：Redux + 持久化）
 */
export function applyJoyRuntimeConfig(
  snapshot: Pick<MusicSourceSettingsSnapshot, 'selectedSourceId' | 'autoSwitch' | 'importedSources'>
): void {
  runtimeConfig.selectedSourceId = String(snapshot.selectedSourceId || '')
  runtimeConfig.autoSwitch = Boolean(snapshot.autoSwitch)
  runtimeConfig.importedSources = Array.isArray(snapshot.importedSources)
    ? snapshot.importedSources
    : []
  sourcePlanCache.clear()
}

/**
 * HTTP request helper (Expo compatible).
 */
const httpFetch = async(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: any
  } = {}
): Promise<MusicUrlResponse> => {
  const fetchOptions: RequestInit = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  }

  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body)
  }

  let responseBody = ''
  let responseStatus: number | null = null
  let responseContentType = ''
  try {
    const response = await fetch(url, fetchOptions)
    responseStatus = response.status
    responseContentType = response.headers.get('content-type') || ''
    responseBody = await response.text()
  } catch (error) {
    throw new Error(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  const trimmedBody = responseBody.trim()
  if (/^https?:\/\//i.test(trimmedBody)) {
    return {
      code: 200,
      url: trimmedBody,
    }
  }

  try {
    return JSON.parse(trimmedBody || '{}')
  } catch {
    const bodyPreview = trimmedBody
      .replace(/\s+/g, ' ')
      .slice(0, 180)
    throw new Error(
      `Source API returned non-JSON response (status=${responseStatus ?? 'unknown'}, contentType=${responseContentType || 'unknown'}, body=${bodyPreview || '<empty>'})`
    )
  }
}

function normalizeApiBaseUrl(apiUrl: string): string {
  const normalized = String(apiUrl || '').trim().replace(/\/+$/, '')
  return normalized.replace(/\/music\/url$/i, '')
}

function resolveResponseUrl(response: MusicUrlResponse): string {
  const candidates: unknown[] = [
    response.url,
    response.data,
    response.data?.url,
    response.data?.surl,
    response.data?.playUrl,
    response.data?.musicUrl,
    response.data?.data,
    response.data?.data?.url,
    response.data?.data?.playUrl,
    response.data?.data?.musicUrl,
  ]

  for (const candidate of candidates) {
    const url = String(candidate || '').trim()
    if (/^https?:\/\//i.test(url)) {
      return url
    }
  }

  return ''
}

function getSongId(musicInfo: JoyMusicInfo): string {
  return String(musicInfo.hash || musicInfo.songmid || musicInfo.id || '').trim()
}

function getPlatformSource(musicInfo: JoyMusicInfo): string {
  return String(musicInfo.source || 'kw').trim().toLowerCase()
}

function getSupportedQualities(config: ImportedMusicSource, platform: string): Quality[] {
  const platformInfo = config.platforms?.[platform]
  if (platformInfo?.qualitys?.length) {
    return platformInfo.qualitys
  }
  return DEFAULT_PLATFORM_QUALITIES[platform] || ['320k', '128k']
}

function buildQualityAttempts(requestedQuality: Quality, supportedQualities: Quality[]): Quality[] {
  const orderedSupported = QUALITY_FALLBACK_ORDER.filter((quality) =>
    supportedQualities.includes(quality)
  )

  if (!orderedSupported.length) {
    return supportedQualities[0] ? [supportedQualities[0]] : []
  }

  const requestedIndex = QUALITY_FALLBACK_ORDER.indexOf(requestedQuality)
  if (requestedIndex < 0) {
    return orderedSupported
  }

  const degradeAttempts = QUALITY_FALLBACK_ORDER
    .slice(requestedIndex)
    .filter((quality) => orderedSupported.includes(quality))

  return degradeAttempts.length ? degradeAttempts : orderedSupported
}

function normalizeTemplatePlaceholders(raw: string): string {
  return raw
    .replace(/\$\{\s*source\s*\}/gi, '{source}')
    .replace(/\$\{\s*quality\s*\}/gi, '{quality}')
    .replace(/\$\{\s*(?:songId|musicId|id|hash|songmid)\s*\}/gi, '{songId}')
}

function normalizePlanPathTemplate(pathTemplate: string): string {
  const normalized = String(pathTemplate || '').trim()
  if (!normalized) return ''
  if (/^https?:\/\//i.test(normalized)) {
    try {
      const parsed = new URL(normalized)
      return `${parsed.pathname || '/'}${parsed.search || ''}`
    } catch {
      return normalized
    }
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

function inferMethodByContext(scriptText: string, index: number): RequestMethod {
  const start = Math.max(0, index - 240)
  const end = Math.min(scriptText.length, index + 420)
  const nearby = scriptText.slice(start, end)
  if (/method\s*:\s*['"]POST['"]/i.test(nearby)) return 'POST'
  if (/method\s*:\s*['"]GET['"]/i.test(nearby)) return 'GET'
  return /\/music\/url/i.test(nearby) ? 'POST' : 'GET'
}

function inferBodyTemplateByContext(scriptText: string, index: number): Record<string, string> | undefined {
  const nearby = scriptText.slice(index, Math.min(scriptText.length, index + 620))
  const block = nearby.match(/body\s*:\s*\{([\s\S]{0,280})\}/i)?.[1]
  if (!block) return undefined

  const bodyTemplate: Record<string, string> = {}
  if (/source\s*:/i.test(block)) bodyTemplate.source = '{source}'
  if (/musicId\s*:/i.test(block)) bodyTemplate.musicId = '{songId}'
  if (/songId\s*:/i.test(block)) bodyTemplate.songId = '{songId}'
  if (/\bid\s*:/i.test(block)) bodyTemplate.id = '{songId}'
  if (/quality\s*:/i.test(block)) bodyTemplate.quality = '{quality}'
  return Object.keys(bodyTemplate).length ? bodyTemplate : undefined
}

function parseApiKeyHeaderName(scriptText: string): string | undefined {
  const match = scriptText.match(/['"]((?:X-Api-Key|X-API-Key|X-Request-Key))['"]\s*:/i)
  if (!match?.[1]) return undefined
  return match[1]
}

function dedupeRequestPlans(plans: RequestPlan[]): RequestPlan[] {
  const seen = new Set<string>()
  const deduped: RequestPlan[] = []
  for (const plan of plans) {
    const normalizedPath = normalizePlanPathTemplate(plan.pathTemplate)
    if (!normalizedPath) continue
    const bodySignature = plan.bodyTemplate
      ? Object.entries(plan.bodyTemplate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('&')
      : ''
    const signature = `${plan.method}|${normalizedPath}|${bodySignature}`
    if (seen.has(signature)) continue
    seen.add(signature)
    deduped.push({
      ...plan,
      pathTemplate: normalizedPath,
    })
  }
  return deduped
}

/**
 * 从脚本文本中提取请求模板，兼容公益音源常见写法。
 */
function parseScriptRequestPlans(sourceConfig: ImportedMusicSource): RequestPlan[] {
  const scriptText = String(sourceConfig.rawScript || '')
  if (!scriptText) return []

  const baseUrl = normalizeApiBaseUrl(sourceConfig.apiUrl)
  const apiKeyHeader = parseApiKeyHeaderName(scriptText)
  const plans: RequestPlan[] = []

  const templateRegex = /`([^`\r\n]*\$\{[^`\r\n]+\}[^`\r\n]*)`/g
  let match: RegExpExecArray | null
  while ((match = templateRegex.exec(scriptText)) !== null) {
    const rawTemplate = String(match[1] || '')
    if (!/(\/music\/url|\/api\/musics\/url|\/url(?:\/|\?)|\/kwurl(?:\?|$))/i.test(rawTemplate)) {
      continue
    }

    const withBase = rawTemplate.replace(/\$\{\s*API_URL\s*\}/gi, baseUrl)
    let normalized = normalizeTemplatePlaceholders(withBase).trim()
    if (baseUrl && normalized.toLowerCase().startsWith(baseUrl.toLowerCase())) {
      normalized = normalized.slice(baseUrl.length)
      if (!normalized.startsWith('/')) {
        normalized = `/${normalized}`
      }
    }
    const method = inferMethodByContext(scriptText, match.index)
    const bodyTemplate = method === 'POST'
      ? inferBodyTemplateByContext(scriptText, match.index)
      : undefined

    plans.push({
      method,
      pathTemplate: normalized,
      bodyTemplate,
      apiKeyHeader,
    })
  }

  return plans
}

/**
 * 兜底请求策略：覆盖 Joy API 与主流公益音源接口风格。
 */
function buildDefaultRequestPlans(): RequestPlan[] {
  return [
    {
      method: 'POST',
      pathTemplate: '/music/url',
      bodyTemplate: {
        source: '{source}',
        musicId: '{songId}',
        quality: '{quality}',
      },
    },
    {
      method: 'POST',
      pathTemplate: '/music/url',
      bodyTemplate: {
        source: '{source}',
        songId: '{songId}',
        quality: '{quality}',
      },
    },
    {
      method: 'GET',
      pathTemplate: '/url?source={source}&songId={songId}&quality={quality}',
    },
    {
      method: 'GET',
      pathTemplate: '/url?source={source}&musicId={songId}&quality={quality}',
    },
    {
      method: 'GET',
      pathTemplate: '/url/{source}/{songId}/{quality}',
    },
    {
      method: 'GET',
      pathTemplate: '/api/musics/url/{source}/{songId}/{quality}',
    },
    {
      method: 'GET',
      pathTemplate: '/kwurl?id={songId}&q={quality}',
    },
    {
      method: 'GET',
      pathTemplate: '/api.php?types=url&source={source}&id={songId}&br={quality}',
    },
  ]
}

function getSourceRequestPlans(sourceConfig: ImportedMusicSource): RequestPlan[] {
  const cacheKey = `${sourceConfig.id}|${sourceConfig.updatedAt}|${sourceConfig.apiUrl}`
  const cached = sourcePlanCache.get(cacheKey)
  if (cached) return cached

  const scriptPlans = dedupeRequestPlans(parseScriptRequestPlans(sourceConfig)).slice(0, 12)
  const plans = dedupeRequestPlans([
    ...scriptPlans,
    ...buildDefaultRequestPlans(),
  ])

  sourcePlanCache.set(cacheKey, plans)
  return plans
}

function fillTemplate(
  template: string,
  params: { source: string; songId: string; quality: Quality },
  encode = true,
): string {
  const sourceValue = encode ? encodeURIComponent(params.source) : params.source
  const songIdValue = encode ? encodeURIComponent(params.songId) : params.songId
  const qualityValue = encode ? encodeURIComponent(params.quality) : params.quality
  return String(template || '')
    .replace(/\{source\}/g, sourceValue)
    .replace(/\{songId\}/g, songIdValue)
    .replace(/\{quality\}/g, qualityValue)
}

function buildRequestUrl(
  sourceConfig: ImportedMusicSource,
  plan: RequestPlan,
  params: { source: string; songId: string; quality: Quality },
): string {
  const filledPath = fillTemplate(plan.pathTemplate, params, true).trim()
  if (/^https?:\/\//i.test(filledPath)) return filledPath
  const baseUrl = normalizeApiBaseUrl(sourceConfig.apiUrl)
  const normalizedPath = normalizePlanPathTemplate(filledPath)
  return `${baseUrl}${normalizedPath}`
}

function buildRequestBody(
  plan: RequestPlan,
  params: { source: string; songId: string; quality: Quality },
): Record<string, string> | undefined {
  if (plan.method !== 'POST') return undefined
  const bodyTemplate = plan.bodyTemplate || {
    source: '{source}',
    musicId: '{songId}',
    quality: '{quality}',
  }

  const body: Record<string, string> = {}
  for (const [field, value] of Object.entries(bodyTemplate)) {
    body[field] = fillTemplate(value, params, false)
  }
  return body
}

function buildApiHeaders(sourceConfig: ImportedMusicSource, apiKeyHeader?: string): Record<string, string> {
  const headers: Record<string, string> = {}
  const apiKey = String(sourceConfig.apiKey || '').trim()
  if (!apiKey) return headers

  headers['X-Api-Key'] = apiKey
  headers['X-API-Key'] = apiKey
  headers['X-Request-Key'] = apiKey
  if (apiKeyHeader) headers[apiKeyHeader] = apiKey
  return headers
}

function resolveResponseCode(response: MusicUrlResponse, resolvedUrl: string): number {
  const candidates: unknown[] = [
    response.code,
    response.status,
    response.errno,
    response.data?.code,
    response.data?.status,
  ]
  for (const candidate of candidates) {
    const numeric = Number(candidate)
    if (Number.isFinite(numeric)) return numeric
  }
  return resolvedUrl ? 200 : NaN
}

function resolveResponseMessage(response: MusicUrlResponse): string {
  const candidates: unknown[] = [
    response.message,
    response.msg,
    response.error,
    response.data?.message,
    response.data?.msg,
    response.data?.error,
  ]
  for (const candidate of candidates) {
    const message = String(candidate || '').trim()
    if (message) return message
  }
  return ''
}

function getCandidateSourceConfigs(platform: string): ImportedMusicSource[] {
  const enabledSources = runtimeConfig.importedSources.filter((item) => item.enabled && item.apiUrl)
  if (!enabledSources.length) return []

  const selected = runtimeConfig.selectedSourceId
    ? enabledSources.find((item) => item.id === runtimeConfig.selectedSourceId)
    : enabledSources[0]

  const primary = selected || enabledSources[0]
  const supportsPlatform = (item: ImportedMusicSource) => {
    if (!item.platforms || !Object.keys(item.platforms).length) return true
    return Boolean(item.platforms[platform])
  }

  if (!runtimeConfig.autoSwitch) {
    return supportsPlatform(primary) ? [primary] : []
  }

  const ordered = [primary, ...enabledSources.filter((item) => item.id !== primary.id)]
  return ordered.filter(supportsPlatform)
}

/**
 * Check whether at least one runtime source can serve current platform.
 */
export function hasConfiguredJoySource(platform: string): boolean {
  return getCandidateSourceConfigs(platform).length > 0
}

/**
 * Request one URL from a specific imported source config.
 */
const requestMusicUrl = async(
  sourceConfig: ImportedMusicSource,
  platform: string,
  musicInfo: JoyMusicInfo,
  quality: Quality
): Promise<string> => {
  const songId = getSongId(musicInfo)
  if (!songId) {
    throw new Error('Missing song ID')
  }

  const params = {
    source: platform,
    songId,
    quality,
  }
  const requestPlans = getSourceRequestPlans(sourceConfig)
  let lastError: Error | null = null

  for (const plan of requestPlans) {
    const requestUrl = buildRequestUrl(sourceConfig, plan, params)
    const body = buildRequestBody(plan, params)
    const headers = buildApiHeaders(sourceConfig, plan.apiKeyHeader)

    try {
      const response = await httpFetch(requestUrl, {
        method: plan.method,
        headers,
        body,
      })

      const resolvedUrl = resolveResponseUrl(response)
      const responseCode = resolveResponseCode(response, resolvedUrl)
      const responseMessage = resolveResponseMessage(response)

      if (!response || !Number.isFinite(responseCode)) {
        throw new Error('Unknown API error')
      }

      // 兼容两类常见服务约定：code=200 与 code=0 都表示成功。
      if (responseCode === 200 || responseCode === 0) {
        if (!resolvedUrl) {
          throw new Error('No URL returned')
        }
        return resolvedUrl
      }

      if (responseCode === 403) {
        throw new Error('API key invalid or expired')
      }
      if (responseCode === 429) {
        throw new Error('Too many requests - please wait before retrying')
      }
      if (responseCode >= 500) {
        throw new Error(`Server error: ${responseMessage || 'Unknown error'}`)
      }

      throw new Error(responseMessage || `Failed to get music URL (code=${responseCode})`)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      continue
    }
  }

  throw lastError || new Error('Failed to get music URL')
}

async function requestWithQualityFallback(
  sourceConfig: ImportedMusicSource,
  platform: string,
  musicInfo: JoyMusicInfo,
  quality: Quality
): Promise<string> {
  const supportedQualities = getSupportedQualities(sourceConfig, platform)
  const attempts = buildQualityAttempts(quality, supportedQualities)
  let lastError: Error | null = null

  for (const qualityAttempt of attempts) {
    try {
      return await requestMusicUrl(sourceConfig, platform, musicInfo, qualityAttempt)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      continue
    }
  }

  throw lastError || new Error('Failed to get URL in all quality attempts')
}

/**
 * Joy music source API implementation.
 */
export const joyMusicSource: MusicSourceAPI = {
  id: 'joy',
  name: 'Joy Source',

  async getMusicUrl(musicInfo: JoyMusicInfo, quality: Quality = 'master'): Promise<string> {
    const platform = getPlatformSource(musicInfo)
    const candidateSources = getCandidateSourceConfigs(platform)

    if (!candidateSources.length) {
      throw new JoySourceUnavailableError()
    }

    let lastError: Error | null = null
    for (const sourceConfig of candidateSources) {
      try {
        return await requestWithQualityFallback(sourceConfig, platform, musicInfo, quality)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        continue
      }
    }

    throw lastError || new Error('所有可用音源均请求失败')
  },

  async getPicUrl(musicInfo: JoyMusicInfo): Promise<string> {
    return musicInfo.picUrl || 'https://via.placeholder.com/300'
  },

  async getLyricInfo(): Promise<any> {
    return {
      lyric: '',
      tlyric: '',
      rlyric: '',
    }
  },

  async search(): Promise<any> {
    return {
      list: [],
      total: 0,
    }
  },
}
