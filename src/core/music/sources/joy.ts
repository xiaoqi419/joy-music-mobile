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
  code: number
  url?: string
  message?: string
}

interface JoyRuntimeConfig {
  selectedSourceId: string
  autoSwitch: boolean
  importedSources: ImportedMusicSource[]
}

const runtimeConfig: JoyRuntimeConfig = {
  selectedSourceId: '',
  autoSwitch: false,
  importedSources: [],
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
  try {
    const response = await fetch(url, fetchOptions)
    responseBody = await response.text()
  } catch (error) {
    throw new Error(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  try {
    return JSON.parse(responseBody)
  } catch {
    throw new Error('Source API returned non-JSON response')
  }
}

function normalizeApiBaseUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, '')
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

  const requestUrl = `${normalizeApiBaseUrl(sourceConfig.apiUrl)}/music/url`
  const headers: Record<string, string> = {}
  if (sourceConfig.apiKey) {
    headers['X-Api-Key'] = sourceConfig.apiKey
  }

  const response = await httpFetch(requestUrl, {
    method: 'POST',
    headers,
    body: {
      source: platform,
      musicId: songId,
      quality,
    },
  })

  if (!response || typeof response.code !== 'number') {
    throw new Error('Unknown API error')
  }

  switch (response.code) {
    case 200:
      if (!response.url) {
        throw new Error('No URL returned')
      }
      return response.url
    case 403:
      throw new Error('API key invalid or expired')
    case 429:
      throw new Error('Too many requests - please wait before retrying')
    case 500:
      throw new Error(`Server error: ${response.message ?? 'Unknown error'}`)
    default:
      throw new Error(response.message ?? 'Failed to get music URL')
  }
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
      throw new Error('未配置可用音源，请先在“我的 > 自定义源管理”中导入并启用音源')
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
