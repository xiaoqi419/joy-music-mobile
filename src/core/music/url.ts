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
 * Select the best available quality
 */
export const getPlayQuality = (
  requestedQuality: Quality | undefined,
  supportedQualities: Quality[]
): Quality => {
  // If specific quality is requested and available, use it
  if (requestedQuality && supportedQualities.includes(requestedQuality)) {
    return requestedQuality
  }

  // Otherwise, use fallback order
  for (const quality of QUALITY_FALLBACK) {
    if (supportedQualities.includes(quality)) {
      return quality
    }
  }

  // Last resort: use the first supported quality
  return supportedQualities[0] || '128k'
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

    // Step 1: Check cache if not refreshing
    if (!isRefresh) {
      const cachedUrl = await musicUrlCache.getMusicUrl(musicId, requestedQuality)
      if (cachedUrl) {
        console.log(`[MusicUrl] Using cached URL for ${musicId}`)
        return {
          url: cachedUrl,
          quality: requestedQuality,
          musicId,
        }
      }
    }

    // Step 2: Get current source
    const source = musicSourceManager.getCurrentSource()
    if (!source) {
      throw new Error('No music source available')
    }

    // Step 3: Get supported qualities
    const supportedQualities = musicSourceManager.getSourceQualities(
      musicSourceManager.getCurrentSourceId()
    )

    // Step 4: Select quality
    const targetQuality = getPlayQuality(requestedQuality, supportedQualities)
    onProgress?.({
      message: `正在尝试 ${targetQuality} 音质（${attempt}/${totalAttempts}）`,
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
      for (const fallbackQuality of QUALITY_FALLBACK) {
        if (fallbackQuality === targetQuality) {
          continue
        }

        if (supportedQualities.includes(fallbackQuality)) {
          onProgress?.({
            message: `正在降级尝试 ${fallbackQuality} 音质（${attempt}/${totalAttempts}）`,
            quality: fallbackQuality,
            attempt,
            totalAttempts,
          })
          try {
            console.log(`[MusicUrl] Trying fallback quality: ${fallbackQuality}`)
            fallbackUrl = await source.getMusicUrl(musicInfo, fallbackQuality)
            console.log(`[MusicUrl] Success with fallback quality: ${fallbackQuality}`)

            // Cache the fallback quality
            await musicUrlCache.saveMusicUrl(
              musicId,
              fallbackQuality,
              fallbackUrl,
              musicSourceManager.getCurrentSourceId()
            )

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
      }

      // All attempts failed
      throw error
    }

    // Step 6: Cache the URL
    await musicUrlCache.saveMusicUrl(
      musicId,
      targetQuality,
      url,
      musicSourceManager.getCurrentSourceId()
    )

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

      return await getMusicUrl({
        ...request,
        attempt: attempt + 1,
        totalAttempts,
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
