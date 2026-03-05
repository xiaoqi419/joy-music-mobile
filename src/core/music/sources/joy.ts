/**
 * Joy music source adapter.
 * Adapts /music/url API to Joy Music Mobile.
 */

import { MusicSourceAPI, Quality } from '../source'
import { ImportedMusicSource, MusicSourceSettingsSnapshot } from '../../config/musicSource'
import { Platform } from 'react-native'

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

interface HttpMetaResponse {
  statusCode: number
  statusMessage: string
  headers: Record<string, string>
  body: unknown
}

interface JoyRuntimeConfig {
  selectedSourceId: string
  autoSwitch: boolean
  importedSources: ImportedMusicSource[]
}

type RequestMethod = 'GET' | 'POST'
type RequestBodyMode = 'template' | 'forward_info'

interface RequestPlan {
  method: RequestMethod
  pathTemplate: string
  bodyTemplate?: Record<string, string>
  bodyMode?: RequestBodyMode
  apiKeyHeader?: string
  platform?: string
  direct?: boolean
}

interface JoyRequestOptions {
  signal?: AbortSignal
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
const sourcePlanPromiseCache = new Map<string, Promise<RequestPlan[]>>()
const PLATFORM_SOURCE_PREFIX_REGEX = /^(wy|kw|tx|kg|mg)[_:]/i

function isAbortLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'AbortError') return true
  return /aborted|abort/i.test(error.message)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const error = new Error('request aborted')
  error.name = 'AbortError'
  throw error
}

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
  sourcePlanPromiseCache.clear()
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
    signal?: AbortSignal
  } = {}
): Promise<MusicUrlResponse> => {
  const fetchOptions: RequestInit = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  }

  if (typeof options.body !== 'undefined') {
    fetchOptions.body = typeof options.body === 'string'
      ? options.body
      : JSON.stringify(options.body)
  }
  if (options.signal) {
    fetchOptions.signal = options.signal
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
    if (isAbortLikeError(error)) {
      throw error instanceof Error ? error : new Error(String(error))
    }
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

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {}
  if (typeof headers.forEach === 'function') {
    headers.forEach((value, key) => {
      record[String(key)] = String(value)
    })
    return record
  }

  const entries = typeof headers.entries === 'function'
    ? Array.from(headers.entries())
    : []
  for (const [key, value] of entries) {
    record[String(key)] = String(value)
  }
  return record
}

const httpFetchMeta = async(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: any
    signal?: AbortSignal
  } = {}
): Promise<HttpMetaResponse> => {
  const fetchOptions: RequestInit = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  }

  if (typeof options.body !== 'undefined') {
    fetchOptions.body = typeof options.body === 'string'
      ? options.body
      : JSON.stringify(options.body)
  }
  if (options.signal) {
    fetchOptions.signal = options.signal
  }

  try {
    const response = await fetch(url, fetchOptions)
    const text = await response.text()
    let parsedBody: unknown = text
    try {
      parsedBody = JSON.parse(text)
    } catch {
      // keep text
    }
    return {
      statusCode: response.status,
      statusMessage: response.statusText || '',
      headers: headersToRecord(response.headers),
      body: parsedBody,
    }
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw error instanceof Error ? error : new Error(String(error))
    }
    throw new Error(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

function normalizeApiBaseUrl(apiUrl: string): string {
  const normalized = String(apiUrl || '').trim().replace(/\/+$/, '')
  return normalized.replace(/\/music\/url$/i, '')
}

function inferKnownApiBase(sourceConfig: ImportedMusicSource): string {
  const scriptText = String(sourceConfig.rawScript || '').toLowerCase()
  const sourceUrl = String(sourceConfig.sourceUrl || '').toLowerCase()
  const name = String(sourceConfig.name || '').toLowerCase()

  if (
    scriptText.includes('nianxinxz') ||
    scriptText.includes('emo-music') ||
    scriptText.includes('wubian.json') ||
    sourceUrl.includes('nianxinxz') ||
    sourceUrl.includes('wubian.json') ||
    name.includes('念心')
  ) {
    return 'https://music.nxinxz.com'
  }

  if (
    scriptText.includes('api.music.lerd.dpdns.org') ||
    sourceUrl.includes('api.music.lerd.dpdns.org') ||
    name.includes('聚合api')
  ) {
    return 'https://api.music.lerd.dpdns.org'
  }

  const rawScript = String(sourceConfig.rawScript || '')
  const variables = parseScriptUrlVariables(rawScript)
  for (const variableUrl of Object.values(variables)) {
    if (!/^https?:\/\//i.test(variableUrl)) continue
    const lower = variableUrl.toLowerCase()
    if (/\.(js|mjs|cjs|json|txt)(\?|$)/i.test(lower)) continue
    try {
      const parsed = new URL(variableUrl)
      return `${parsed.origin}${parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '')}`
    } catch {
      continue
    }
  }

  return ''
}

const SCRIPT_SAMPLE_QUALITY: Quality = '320k'
const SCRIPT_SAMPLE_MUSIC_INFO: Record<string, JoyMusicInfo> = {
  kw: { id: 'JOY_RUNTIME_KW_ID', hash: 'JOY_RUNTIME_KW_ID', songmid: 'JOY_RUNTIME_KW_ID', source: 'kw' },
  wy: { id: 'JOY_RUNTIME_WY_ID', hash: 'JOY_RUNTIME_WY_ID', songmid: 'JOY_RUNTIME_WY_ID', source: 'wy' },
  tx: { id: 'JOY_RUNTIME_TX_ID', hash: 'JOY_RUNTIME_TX_ID', songmid: 'JOY_RUNTIME_TX_ID', source: 'tx' },
  kg: { id: 'JOY_RUNTIME_KG_ID', hash: 'JOY_RUNTIME_KG_ID', songmid: 'JOY_RUNTIME_KG_ID', source: 'kg' },
  mg: { id: 'JOY_RUNTIME_MG_ID', hash: 'JOY_RUNTIME_MG_ID', songmid: 'JOY_RUNTIME_MG_ID', source: 'mg' },
}

type ScriptRequestHandler = (payload: Record<string, unknown>) => unknown

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(String(value || '').trim())
}

function isPrivateIpv4Host(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) {
    return false
  }

  if (parts[0] === 10) return true
  if (parts[0] === 127) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  return false
}

function normalizeRequestUrlForDevice(url: string): string {
  const trimmed = String(url || '').trim()
  if (!trimmed) return ''
  if (Platform.OS !== 'ios' || !/^http:\/\//i.test(trimmed)) return trimmed

  try {
    const parsed = new URL(trimmed)
    const hostname = parsed.hostname.toLowerCase()
    if (
      hostname === 'localhost' ||
      hostname === '0.0.0.0' ||
      isPrivateIpv4Host(hostname)
    ) {
      return trimmed
    }
    parsed.protocol = 'https:'
    return parsed.toString()
  } catch {
    return trimmed
  }
}

function extractUrlFromUnknown(result: unknown): string {
  if (typeof result === 'string') {
    return result.trim()
  }
  if (!result || typeof result !== 'object') {
    return ''
  }

  const raw = result as Record<string, unknown>
  const candidates: unknown[] = [
    raw.url,
    raw.data,
    (raw.data as Record<string, unknown> | undefined)?.url,
  ]
  for (const candidate of candidates) {
    const value = String(candidate || '').trim()
    if (value) return value
  }
  return ''
}

function normalizeRuntimeTemplate(runtimeUrl: string, sampleSongId: string): string {
  let template = String(runtimeUrl || '').trim()
  if (!template) return ''

  const encodedSongId = encodeURIComponent(sampleSongId)
  if (encodedSongId) {
    template = template.split(encodedSongId).join('{songId}')
  }
  if (sampleSongId) {
    template = template.split(sampleSongId).join('{songId}')
  }

  if (isNxinxzPhpTemplate(template)) {
    template = template.replace(/([?&]level=)[^&]*/i, '$1{level}')
  }

  return template
}

function createScriptRuntimeHandlers(scriptText: string): ScriptRequestHandler[] {
  if (!scriptText) return []

  const handlers: ScriptRequestHandler[] = []
  const globalObject = globalThis as Record<string, unknown>
  const previousLx = globalObject.lx
  const eventNamesProxy = new Proxy<Record<string, string>>({}, {
    get: (_target, prop: string | symbol) => String(prop),
  })

  const mockRequest = (...args: unknown[]) => {
    const requestUrl = String(args[0] || '')
    const callbackCandidate = typeof args[2] === 'function'
      ? args[2]
      : (typeof args[1] === 'function' ? args[1] : undefined)
    if (typeof callbackCandidate === 'function') {
      try {
        const callback = callbackCandidate as (
          error: Error | null,
          response: Record<string, unknown>
        ) => void
        if (/\/init\.conf(?:\?|$)/i.test(requestUrl)) {
          callback(null, {
            statusCode: 200,
            statusMessage: 'OK',
            headers: {},
            body: {
              code: 200,
              data: {
                update: { version: '0.0.0' },
                init: { sources: {} },
              },
            },
          })
          return
        }
        callback(new Error('Joy runtime request blocked'), {
          statusCode: 500,
          statusMessage: 'Blocked',
          headers: {},
          body: {
            code: 500,
            msg: 'Joy runtime request blocked',
          },
        })
      } catch {
        // noop
      }
    }
  }

  const mockOn = (_event: unknown, handler: unknown) => {
    if (typeof handler === 'function') {
      handlers.push(handler as ScriptRequestHandler)
    }
  }

  const mockSend = () => undefined

  try {
    globalObject.lx = {
      EVENT_NAMES: eventNamesProxy,
      request: mockRequest,
      on: mockOn,
      send: mockSend,
    }

    const executor = new Function(scriptText)
    executor()
  } catch {
    // 脚本可能包含更新检查等异常逻辑，保留已注册的回调继续推断。
  } finally {
    if (typeof previousLx === 'undefined') {
      delete globalObject.lx
    } else {
      globalObject.lx = previousLx
    }
  }

  return handlers
}

async function resolveRuntimeHandlerUrl(
  handler: ScriptRequestHandler,
  platform: string,
  action: string,
): Promise<string> {
  const musicInfo = SCRIPT_SAMPLE_MUSIC_INFO[platform] || {
    id: `JOY_RUNTIME_${platform.toUpperCase()}_ID`,
    hash: `JOY_RUNTIME_${platform.toUpperCase()}_ID`,
    songmid: `JOY_RUNTIME_${platform.toUpperCase()}_ID`,
    source: platform,
  }

  const infoVariants: Array<Record<string, unknown>> = [
    {
      musicInfo,
      quality: SCRIPT_SAMPLE_QUALITY,
      source: platform,
      ...musicInfo,
    },
    {
      quality: SCRIPT_SAMPLE_QUALITY,
      ...musicInfo,
    },
    {
      songInfo: musicInfo,
      quality: SCRIPT_SAMPLE_QUALITY,
    },
  ]

  const payloads: Record<string, unknown>[] = []
  for (const info of infoVariants) {
    payloads.push({ source: platform, action, info })
    payloads.push({ source: platform, type: action, info })
    payloads.push({ source: platform, action, musicInfo, quality: SCRIPT_SAMPLE_QUALITY })
  }

  for (const payload of payloads) {
    try {
      const result = await Promise.resolve(handler(payload))
      const url = extractUrlFromUnknown(result)
      if (isHttpUrl(url)) {
        return url
      }
    } catch {
      continue
    }
  }

  return ''
}

async function parseScriptRuntimeRequestPlans(sourceConfig: ImportedMusicSource): Promise<RequestPlan[]> {
  const scriptText = String(sourceConfig.rawScript || '')
  if (!scriptText) return []

  const handlers = createScriptRuntimeHandlers(scriptText)
  if (!handlers.length) return []

  const configuredPlatforms = Object.keys(sourceConfig.platforms || {})
    .filter((platform) => platform && platform !== 'local')
  const platformCandidates = configuredPlatforms.length
    ? configuredPlatforms
    : Object.keys(DEFAULT_PLATFORM_QUALITIES)

  const plans: RequestPlan[] = []
  for (const platform of platformCandidates) {
    const configuredActions = sourceConfig.platforms?.[platform]?.actions || []
    const actionCandidates = Array.from(new Set(['musicUrl', ...configuredActions]))
    let matchedUrl = ''

    for (const handler of handlers) {
      for (const action of actionCandidates) {
        matchedUrl = await resolveRuntimeHandlerUrl(handler, platform, action)
        if (matchedUrl) break
      }
      if (matchedUrl) break
    }

    if (!isHttpUrl(matchedUrl)) {
      continue
    }

    const sampleSongId = SCRIPT_SAMPLE_MUSIC_INFO[platform]?.id || `JOY_RUNTIME_${platform.toUpperCase()}_ID`
    const template = normalizeRuntimeTemplate(matchedUrl, sampleSongId)
    if (!isHttpUrl(template)) {
      continue
    }

    plans.push({
      method: 'GET',
      pathTemplate: template,
      platform,
      direct: true,
    })
  }

  return plans
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
      return normalizeRequestUrlForDevice(url)
    }
  }

  return ''
}

function normalizeSongId(raw: unknown): string {
  const normalized = String(raw || '').trim()
  if (!normalized) return ''
  const prefixed = normalized.match(/^(wy|kw|tx|kg|mg)_(.+)$/i)
  if (prefixed?.[2]) {
    return String(prefixed[2]).trim()
  }
  return normalized
}

function getSongId(musicInfo: JoyMusicInfo): string {
  return normalizeSongId(musicInfo.hash || musicInfo.songmid || musicInfo.id)
}

function getPlatformSource(musicInfo: JoyMusicInfo): string {
  const normalizedSource = String(musicInfo.source || '').trim().toLowerCase()
  if (normalizedSource) return normalizedSource

  const candidates = [musicInfo.songmid, musicInfo.id, musicInfo.hash]
  for (const candidate of candidates) {
    const text = String(candidate || '').trim()
    if (!text) continue
    const prefix = text.match(PLATFORM_SOURCE_PREFIX_REGEX)?.[1]
    if (prefix) {
      return prefix.toLowerCase()
    }
  }

  return 'kw'
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
    .replace(/\$\{\s*level\s*\}/gi, '{level}')
    .replace(/\$\{\s*(?:songId|musicId|id|hash|songmid)\s*\}/gi, '{songId}')
}

function escapeRegExp(input: string): string {
  return String(input || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseScriptUrlVariables(scriptText: string): Record<string, string> {
  const variables: Record<string, string> = {}
  const regex = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*['"](https?:\/\/[^'"`\s]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(scriptText)) !== null) {
    const variableName = String(match[1] || '').trim()
    const urlValue = String(match[2] || '').trim()
    if (!variableName || !urlValue) continue
    variables[variableName] = urlValue
  }
  return variables
}

function inferBodyModeByContext(scriptText: string, index: number): RequestBodyMode | undefined {
  const start = Math.max(0, index - 120)
  const end = Math.min(scriptText.length, index + 480)
  const nearby = scriptText.slice(start, end)
  if (
    /body\s*:\s*(?:t|JSON\.stringify)\s*\(\s*info\s*\)/i.test(nearby)
    || /body\s*:\s*info\b/i.test(nearby)
  ) {
    return 'forward_info'
  }
  return undefined
}

function normalizePlanPathTemplate(pathTemplate: string): string {
  const normalized = String(pathTemplate || '').trim()
  if (!normalized) return ''
  if (/^https?:\/\//i.test(normalized)) {
    try {
      return new URL(normalized).toString()
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

function mapQualityToNxinxzLevel(quality: Quality): string {
  switch (quality) {
    case '128k':
      return 'standard'
    case '320k':
      return 'higher'
    case 'flac':
    case 'flac24bit':
    case 'hires':
    case 'atmos':
    case 'atmos_plus':
    case 'master':
      return 'lossless'
    default:
      return 'higher'
  }
}

function isNxinxzPhpTemplate(template: string): boolean {
  const lower = String(template || '').toLowerCase()
  return /music\.nxinxz\.com\/(?:wy|kw|mg)\.php/.test(lower)
    || /music\.nxinxz\.com\/kgqq\/(?:tx|kg)\.php/.test(lower)
    || /\/(?:wy|kw|mg)\.php\?/.test(lower)
    || /\/kgqq\/(?:tx|kg)\.php\?/.test(lower)
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
  if (/type\s*:/i.test(block)) bodyTemplate.type = '{quality}'
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
    const signature = `${plan.method}|${plan.platform || '*'}|${plan.direct ? 'direct' : 'request'}|${plan.bodyMode || 'template'}|${normalizedPath}|${bodySignature}`
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

  const baseUrl = normalizeApiBaseUrl(sourceConfig.apiUrl || inferKnownApiBase(sourceConfig))
  const urlVariables = parseScriptUrlVariables(scriptText)
  const apiKeyHeader = parseApiKeyHeaderName(scriptText)
  const plans: RequestPlan[] = []

  const templateRegex = /`([^`\r\n]*\$\{[^`\r\n]+\}[^`\r\n]*)`/g
  let match: RegExpExecArray | null
  while ((match = templateRegex.exec(scriptText)) !== null) {
    const rawTemplate = String(match[1] || '')
    const normalizedCandidate = normalizeTemplatePlaceholders(rawTemplate)
    if (
      !/(\/music\/url|\/api\/musics\/url|\/url(?:\/|\?)|\/kwurl(?:\?|$)|\/api\.php(?:\?|$))/i.test(rawTemplate)
      && !/\{source\}/i.test(normalizedCandidate)
    ) {
      continue
    }

    let withBase = rawTemplate.replace(/\$\{\s*API_URL\s*\}/gi, baseUrl)
    for (const [variableName, variableUrl] of Object.entries(urlVariables)) {
      const variablePattern = new RegExp(`\\$\\{\\s*${escapeRegExp(variableName)}\\s*\\}`, 'g')
      withBase = withBase.replace(variablePattern, variableUrl)
    }

    let normalized = normalizeTemplatePlaceholders(withBase).trim()
    if (baseUrl && normalized.toLowerCase().startsWith(baseUrl.toLowerCase())) {
      normalized = normalized.slice(baseUrl.length)
      if (!normalized.startsWith('/')) {
        normalized = `/${normalized}`
      }
    }
    const method = inferMethodByContext(scriptText, match.index)
    const bodyMode = inferBodyModeByContext(scriptText, match.index)
    const bodyTemplate = method === 'POST'
      ? inferBodyTemplateByContext(scriptText, match.index)
      : undefined

    plans.push({
      method,
      pathTemplate: normalized,
      bodyMode,
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
        type: '{quality}',
      },
    },
    {
      method: 'POST',
      pathTemplate: '/music/url',
      bodyTemplate: {
        source: '{source}',
        songId: '{songId}',
        quality: '{quality}',
        type: '{quality}',
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
    {
      method: 'GET',
      pathTemplate: '/wy.php?id={songId}&level={level}&type=mp3',
      platform: 'wy',
      direct: true,
    },
    {
      method: 'GET',
      pathTemplate: '/kw.php?id={songId}&level={level}&type=mp3',
      platform: 'kw',
      direct: true,
    },
    {
      method: 'GET',
      pathTemplate: '/mg.php?id={songId}&level={level}&type=mp3',
      platform: 'mg',
      direct: true,
    },
    {
      method: 'GET',
      pathTemplate: '/kgqq/tx.php?id={songId}&level={level}&type=mp3',
      platform: 'tx',
      direct: true,
    },
    {
      method: 'GET',
      pathTemplate: '/kgqq/kg.php?id={songId}&level={level}&type=mp3',
      platform: 'kg',
      direct: true,
    },
  ]
}

async function getSourceRequestPlans(sourceConfig: ImportedMusicSource): Promise<RequestPlan[]> {
  const cacheKey = `${sourceConfig.id}|${sourceConfig.updatedAt}|${sourceConfig.apiUrl}`
  const cached = sourcePlanCache.get(cacheKey)
  if (cached) return cached

  const pending = sourcePlanPromiseCache.get(cacheKey)
  if (pending) {
    return pending
  }

  const planPromise = (async(): Promise<RequestPlan[]> => {
    const runtimePlans = dedupeRequestPlans(await parseScriptRuntimeRequestPlans(sourceConfig)).slice(0, 12)
    const scriptPlans = dedupeRequestPlans(parseScriptRequestPlans(sourceConfig)).slice(0, 12)
    const plans = dedupeRequestPlans([
      ...runtimePlans,
      ...scriptPlans,
      ...buildDefaultRequestPlans(),
    ])
    sourcePlanCache.set(cacheKey, plans)
    return plans
  })()

  sourcePlanPromiseCache.set(cacheKey, planPromise)
  try {
    return await planPromise
  } finally {
    sourcePlanPromiseCache.delete(cacheKey)
  }
}

function fillTemplate(
  template: string,
  params: { source: string; songId: string; quality: Quality },
  encode = true,
): string {
  const sourceValue = encode ? encodeURIComponent(params.source) : params.source
  const songIdValue = encode ? encodeURIComponent(params.songId) : params.songId
  const qualityValue = encode ? encodeURIComponent(params.quality) : params.quality
  const level = mapQualityToNxinxzLevel(params.quality)
  const levelValue = encode ? encodeURIComponent(level) : level
  return String(template || '')
    .replace(/\{source\}/g, sourceValue)
    .replace(/\{songId\}/g, songIdValue)
    .replace(/\{quality\}/g, qualityValue)
    .replace(/\{level\}/g, levelValue)
}

function buildRequestUrl(
  sourceConfig: ImportedMusicSource,
  plan: RequestPlan,
  params: { source: string; songId: string; quality: Quality },
): string {
  const filledPath = fillTemplate(plan.pathTemplate, params, true).trim()
  if (/^https?:\/\//i.test(filledPath)) return normalizeRequestUrlForDevice(filledPath)

  const normalizedPath = normalizePlanPathTemplate(filledPath)
  if (!normalizedPath) return ''
  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizeRequestUrlForDevice(normalizedPath)
  }

  const baseUrl = normalizeApiBaseUrl(sourceConfig.apiUrl || inferKnownApiBase(sourceConfig))
  if (!baseUrl) return ''
  return normalizeRequestUrlForDevice(`${baseUrl}${normalizedPath}`)
}

function buildForwardInfoBody(
  musicInfo: JoyMusicInfo,
  params: { source: string; songId: string; quality: Quality },
): Record<string, unknown> {
  const normalizedMusicInfo: Record<string, unknown> = {
    ...musicInfo,
    source: String(musicInfo.source || params.source || '').trim().toLowerCase(),
  }

  const id = String(musicInfo.id || '').trim()
  const hash = String(musicInfo.hash || '').trim()
  const songmid = String(musicInfo.songmid || '').trim()
  if (id) normalizedMusicInfo.id = id
  if (hash) normalizedMusicInfo.hash = hash
  if (songmid) normalizedMusicInfo.songmid = songmid

  return {
    type: params.quality,
    musicInfo: normalizedMusicInfo,
  }
}

function buildRequestBody(
  plan: RequestPlan,
  params: { source: string; songId: string; quality: Quality },
  musicInfo: JoyMusicInfo,
): Record<string, unknown> | undefined {
  if (plan.method !== 'POST') return undefined
  if (plan.bodyMode === 'forward_info') {
    return buildForwardInfoBody(musicInfo, params)
  }

  const bodyTemplate = plan.bodyTemplate || {
    source: '{source}',
    musicId: '{songId}',
    quality: '{quality}',
    type: '{quality}',
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

function pickValueByPath(input: unknown, keys: string[]): unknown {
  let current = input
  for (const key of keys) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function normalizeHeaderRecord(input: unknown): Record<string, string> | undefined {
  if (!input || typeof input !== 'object') return undefined
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const headerName = String(key || '').trim()
    if (!headerName) continue
    headers[headerName] = String(value ?? '')
  }
  return Object.keys(headers).length ? headers : undefined
}

async function resolveRedirectRuleUrl(
  response: MusicUrlResponse,
  options?: JoyRequestOptions,
): Promise<string> {
  throwIfAborted(options?.signal)
  const data = response.data
  const requestConfig = data?.request
  const responseConfig = data?.response
  const followUrl = String(requestConfig?.url || '').trim()
  if (!isHttpUrl(followUrl)) return ''

  const requestOptions = requestConfig?.options && typeof requestConfig.options === 'object'
    ? requestConfig.options as Record<string, unknown>
    : {}
  const method = String(requestOptions.method || 'GET').toUpperCase()
  const headers = normalizeHeaderRecord(requestOptions.headers)
  const body = requestOptions.body
  const encodedUrl = normalizeRequestUrlForDevice(encodeURI(followUrl))
  const followResponse = await httpFetchMeta(encodedUrl, {
    method,
    headers,
    body,
    signal: options?.signal,
  })
  throwIfAborted(options?.signal)

  const checkKeys = Array.isArray(responseConfig?.check?.key)
    ? responseConfig.check.key.map((item: unknown) => String(item))
    : []
  const checkValue = responseConfig?.check?.value
  if (checkKeys.length > 0) {
    const actual = pickValueByPath(followResponse, checkKeys)
    if (actual !== checkValue) {
      return ''
    }
  }

  const urlKeys = Array.isArray(responseConfig?.url)
    ? responseConfig.url.map((item: unknown) => String(item))
    : []
  const nestedUrl = urlKeys.length
    ? String(pickValueByPath(followResponse, urlKeys) || '').trim()
    : ''
  if (!isHttpUrl(nestedUrl)) return ''

  return normalizeRequestUrlForDevice(nestedUrl)
}

function getCandidateSourceConfigs(platform: string): ImportedMusicSource[] {
  const enabledSources = runtimeConfig.importedSources.filter((item) =>
    item.enabled && (String(item.apiUrl || '').trim() || String(item.rawScript || '').trim())
  )
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
  quality: Quality,
  options?: JoyRequestOptions,
): Promise<string> => {
  throwIfAborted(options?.signal)
  const songId = getSongId(musicInfo)
  if (!songId) {
    throw new Error('Missing song ID')
  }

  const params = {
    source: platform,
    songId,
    quality,
  }
  const requestPlans = await getSourceRequestPlans(sourceConfig)
  let lastError: Error | null = null

  for (const plan of requestPlans) {
    throwIfAborted(options?.signal)
    if (plan.platform && plan.platform !== platform) {
      continue
    }

    const requestUrl = buildRequestUrl(sourceConfig, plan, params)
    if (!requestUrl) {
      continue
    }

    if (plan.direct) {
      return requestUrl
    }

    const body = buildRequestBody(plan, params, musicInfo)
    const headers = buildApiHeaders(sourceConfig, plan.apiKeyHeader)

    try {
      const response = await httpFetch(requestUrl, {
        method: plan.method,
        headers,
        body,
        signal: options?.signal,
      })
      throwIfAborted(options?.signal)

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
      if (responseCode === 303) {
        const redirectedUrl = await resolveRedirectRuleUrl(response, options)
        if (redirectedUrl) {
          return redirectedUrl
        }
        throw new Error(responseMessage || 'Source redirect rule failed')
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
      if (isAbortLikeError(error)) {
        throw error instanceof Error ? error : new Error(String(error))
      }
      lastError = error instanceof Error ? error : new Error(String(error))
      console.log(
        `[JoySource] Plan failed ${plan.method} ${plan.pathTemplate} (${platform}): ${lastError.message}`
      )
      continue
    }
  }

  if (lastError) {
    throw lastError
  }

  throw new Error(
    `Failed to get music URL: no request plan matched for ${platform} (${sourceConfig.name || sourceConfig.id})`
  )
}

async function requestWithQualityFallback(
  sourceConfig: ImportedMusicSource,
  platform: string,
  musicInfo: JoyMusicInfo,
  quality: Quality,
  options?: JoyRequestOptions,
): Promise<string> {
  const supportedQualities = getSupportedQualities(sourceConfig, platform)
  const attempts = buildQualityAttempts(quality, supportedQualities)
  let lastError: Error | null = null

  for (const qualityAttempt of attempts) {
    throwIfAborted(options?.signal)
    try {
      return await requestMusicUrl(sourceConfig, platform, musicInfo, qualityAttempt, options)
    } catch (error) {
      if (isAbortLikeError(error)) {
        throw error instanceof Error ? error : new Error(String(error))
      }
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

  async getMusicUrl(
    musicInfo: JoyMusicInfo,
    quality: Quality = 'master',
    options?: JoyRequestOptions,
  ): Promise<string> {
    throwIfAborted(options?.signal)
    const platform = getPlatformSource(musicInfo)
    const candidateSources = getCandidateSourceConfigs(platform)

    if (!candidateSources.length) {
      throw new JoySourceUnavailableError()
    }

    let lastError: Error | null = null
    for (const sourceConfig of candidateSources) {
      throwIfAborted(options?.signal)
      try {
        return await requestWithQualityFallback(sourceConfig, platform, musicInfo, quality, options)
      } catch (error) {
        if (isAbortLikeError(error)) {
          throw error instanceof Error ? error : new Error(String(error))
        }
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
