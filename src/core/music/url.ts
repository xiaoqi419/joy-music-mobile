/**
 * Music URL fetching module
 * Handles getting music URLs with caching and error handling
 */

import { musicSourceManager, Quality } from './source'
import { musicUrlCache } from './cache'

export interface MusicUrlRequest {
  musicId: string
  musicInfo: any
  quality?: Quality
  isRefresh?: boolean
  onProgress?: (progress: MusicUrlProgress) => void
  attempt?: number
  totalAttempts?: number
}

export interface MusicUrlResponse {
  url: string
  quality: Quality
  musicId: string
}

export interface MusicUrlProgress {
  message: string
  quality?: Quality
  attempt: number
  totalAttempts: number
}

/**
 * Default quality fallback order
 */
const QUALITY_FALLBACK: Quality[] = [
  'master',
  'atmos_plus',
  'atmos',
  'hires',
  'flac24bit',
  'flac',
  '320k',
  '128k',
]

/**
 * Read per-track quality capabilities from track metadata (e.g. _types).
 */
const getTrackAvailableQualities = (musicInfo: any): Quality[] => {
  const rawTypes = musicInfo?._types
  if (!rawTypes || typeof rawTypes !== 'object') return []

  const result: Quality[] = []
  for (const quality of QUALITY_FALLBACK) {
    if ((rawTypes as Record<string, unknown>)[quality]) {
      result.push(quality)
    }
  }
  return result
}

/**
 * Merge source-supported qualities and track-supported qualities.
 */
const getEffectiveQualities = (
  sourceQualities: Quality[],
  trackQualities: Quality[]
): Quality[] => {
  if (!trackQualities.length) return sourceQualities
  const trackSet = new Set(trackQualities)
  const filtered = QUALITY_FALLBACK.filter(
    (quality) => trackSet.has(quality) && sourceQualities.includes(quality)
  )
  return filtered.length ? filtered : sourceQualities
}

/**
 * Build quality attempts with strict downward fallback.
 */
const getPlayQualityAttempts = (
  requestedQuality: Quality | undefined,
  supportedQualities: Quality[]
): Quality[] => {
  const orderedSupported = QUALITY_FALLBACK.filter((quality) =>
    supportedQualities.includes(quality)
  )
  if (!orderedSupported.length) {
    return supportedQualities[0] ? [supportedQualities[0]] : ['128k']
  }

  if (!requestedQuality) {
    return orderedSupported
  }

  const requestedIndex = QUALITY_FALLBACK.indexOf(requestedQuality)
  if (requestedIndex < 0) {
    return orderedSupported
  }

  const degradeAttempts = QUALITY_FALLBACK
    .slice(requestedIndex)
    .filter((quality) => orderedSupported.includes(quality))

  return degradeAttempts.length ? degradeAttempts : orderedSupported
}

/**
 * Select the best available quality.
 */
export const getPlayQuality = (
  requestedQuality: Quality | undefined,
  supportedQualities: Quality[]
): Quality => {
  const attempts = getPlayQualityAttempts(requestedQuality, supportedQualities)
  return attempts[0] || supportedQualities[0] || '128k'
}

/**
 * Fetch music URL from source
 * Implements retry logic and error handling
 */
export const getMusicUrl = async(request: MusicUrlRequest): Promise<MusicUrlResponse> => {
  const {
    musicId,
    musicInfo,
    quality,
    isRefresh = false,
    onProgress,
    attempt = 1,
    totalAttempts = 1,
  } = request

  try {
    const requestedQuality = quality || 'master'
    const trackSource = String(musicInfo?.source || '').toLowerCase()
    // TX 链接时效通常更短，命中陈旧缓存后会出现“有链接但无法播放”。
    const shouldSkipCache = trackSource === 'tx'

    // Step 1: Get current source
    const source = musicSourceManager.getCurrentSource()
    if (!source) {
      throw new Error('No music source available')
    }

    // Step 2: Resolve effective qualities (source + track capabilities)
    const sourceQualities = musicSourceManager.getSourceQualities(
      musicSourceManager.getCurrentSourceId()
    )
    const trackQualities = getTrackAvailableQualities(musicInfo)
    // TX 的 _types 在部分歌曲上不稳定，可能把可用音质误判得过窄（只剩 flac24bit）。
    // 这里对 TX 始终按平台全量音质链路尝试，避免被单曲元数据卡死。
    const availableQualities = trackSource === 'tx'
      ? sourceQualities
      : getEffectiveQualities(sourceQualities, trackQualities)
    const qualityAttempts = getPlayQualityAttempts(requestedQuality, availableQualities)
    const targetQuality = qualityAttempts[0] || '128k'

    if (trackSource !== 'tx' && trackQualities.length && !trackQualities.includes(requestedQuality)) {
      console.log(
        `[MusicUrl] ${musicId} unavailable in ${requestedQuality}, fallback to ${targetQuality}`
      )
    }

    // Step 3: Check cache if not refreshing
    if (!isRefresh && !shouldSkipCache) {
      const cachedUrl = await musicUrlCache.getMusicUrl(musicId, targetQuality)
      if (cachedUrl) {
        console.log(`[MusicUrl] Using cached URL for ${musicId}`)
        return {
          url: cachedUrl,
          quality: targetQuality,
          musicId,
        }
      }
    }

    // Step 4: Request URL
    const retrySuffix = totalAttempts > 1 ? `（网络重试 ${attempt}/${totalAttempts}）` : ''
    onProgress?.({
      message: `正在尝试 ${targetQuality} 音质${retrySuffix}`,
      quality: targetQuality,
      attempt,
      totalAttempts,
    })

    // Step 5: Fetch URL from source
    console.log(`[MusicUrl] Fetching URL for ${musicId} with quality ${targetQuality}`)
    let url: string

    try {
      url = await source.getMusicUrl(musicInfo, targetQuality)
    } catch (error) {
      // If the requested quality fails, try fallback qualities
      console.warn(`[MusicUrl] Failed with ${targetQuality}, trying fallback qualities`)

      let fallbackUrl: string | null = null
      for (const fallbackQuality of qualityAttempts.slice(1)) {
        const fallbackRetrySuffix = totalAttempts > 1 ? `（网络重试 ${attempt}/${totalAttempts}）` : ''
        onProgress?.({
          message: `正在降级尝试 ${fallbackQuality} 音质${fallbackRetrySuffix}`,
          quality: fallbackQuality,
          attempt,
          totalAttempts,
        })
        try {
          console.log(`[MusicUrl] Trying fallback quality: ${fallbackQuality}`)
          fallbackUrl = await source.getMusicUrl(musicInfo, fallbackQuality)
          console.log(`[MusicUrl] Success with fallback quality: ${fallbackQuality}`)

          // Cache the fallback quality
          if (!shouldSkipCache) {
            await musicUrlCache.saveMusicUrl(
              musicId,
              fallbackQuality,
              fallbackUrl,
              musicSourceManager.getCurrentSourceId()
            )
          }

          return {
            url: fallbackUrl,
            quality: fallbackQuality,
            musicId,
          }
        } catch (fallbackError) {
          console.warn(`[MusicUrl] Fallback quality ${fallbackQuality} failed`)
          continue
        }
      }

      // All attempts failed
      throw error
    }

    // Step 6: Cache the URL
    if (!shouldSkipCache) {
      await musicUrlCache.saveMusicUrl(
        musicId,
        targetQuality,
        url,
        musicSourceManager.getCurrentSourceId()
      )
    }

    console.log(`[MusicUrl] Successfully fetched URL for ${musicId}`)
    return {
      url,
      quality: targetQuality,
      musicId,
    }
  } catch (error) {
    console.error(`[MusicUrl] Error fetching URL for ${musicId}:`, error)
    throw error
  }
}

/**
 * Get music URL with retry logic
 */
export const getMusicUrlWithRetry = async(
  request: MusicUrlRequest,
  maxRetries: number = 2
): Promise<MusicUrlResponse> => {
  let lastError: Error | null = null
  const totalAttempts = maxRetries + 1

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Add delay on retry
      if (attempt > 0) {
        const delay = Math.random() * 2000 + 1000 // 1-3 seconds
        request.onProgress?.({
          message: `第 ${attempt + 1}/${totalAttempts} 次重试，等待 ${Math.round(delay)}ms...`,
          attempt: attempt + 1,
          totalAttempts,
        })
        console.log(`[MusicUrl] Retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      const requestAttempt = attempt + 1
      const isRetryAttempt = attempt > 0
      return await getMusicUrl({
        ...request,
        attempt: isRetryAttempt ? requestAttempt : 1,
        totalAttempts: isRetryAttempt ? totalAttempts : 1,
      })
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.warn(`[MusicUrl] Attempt ${attempt + 1} failed:`, lastError.message)
      request.onProgress?.({
        message: `第 ${attempt + 1}/${totalAttempts} 次失败：${lastError.message}`,
        attempt: attempt + 1,
        totalAttempts,
      })

      if (attempt === maxRetries) {
        break
      }
    }
  }

  throw lastError || new Error('Failed to fetch music URL after retries')
}
