/**
 * Music URL and data caching system
 * Implements multi-layer caching strategy
 */

import { Quality } from './source'
import { audioFileCache } from './audioCache'
import {
  clearLyricCacheRecords,
  clearUrlCacheRecords,
  getLyricCacheRecord,
  getUrlCacheRecord,
  removeLyricCacheRecord,
  removeUrlCacheByMusicId,
  removeUrlCacheRecord,
  saveLyricCacheRecord,
  saveUrlCacheRecord,
} from './cacheSqlite'

const CACHE_PREFIX = '@joy_music_'
const URL_CACHE_PREFIX = `${CACHE_PREFIX}url_`

/** 播放 URL 缓存有效期（20 分钟），多数平台 URL 有效期在 10~30 分钟 */
const URL_CACHE_TTL = 20 * 60 * 1000

export interface CachedMusicUrl {
  url: string
  quality: Quality
  timestamp: number
  source: string
}

/**
 * Music URL cache manager
 */
class MusicUrlCache {
  /**
   * Save music URL to cache
   */
  async saveMusicUrl(
    musicId: string,
    quality: Quality,
    url: string,
    source: string
  ): Promise<void> {
    try {
      const key = `${URL_CACHE_PREFIX}${musicId}_${quality}`
      const timestamp = Date.now()
      await saveUrlCacheRecord({
        cacheKey: key,
        musicId,
        quality,
        url,
        source,
        timestamp,
        ttlMs: URL_CACHE_TTL,
      })
      console.log(`[Cache] Saved URL for ${musicId} (${quality})`)
    } catch (error) {
      console.error('[Cache] Failed to save URL:', error)
    }
  }

  /**
   * Get cached music URL (returns null if expired)
   */
  async getMusicUrl(musicId: string, quality: Quality): Promise<string | null> {
    try {
      const key = `${URL_CACHE_PREFIX}${musicId}_${quality}`
      const cached = await getUrlCacheRecord(key)
      if (!cached) {
        return null
      }

      if (Date.now() - cached.timestamp > URL_CACHE_TTL) {
        console.log(`[Cache] URL expired for ${musicId} (${quality}), clearing`)
        await removeUrlCacheRecord(key)
        return null
      }

      console.log(`[Cache] Retrieved URL for ${musicId} (${quality})`)
      return cached.url
    } catch (error) {
      console.error('[Cache] Failed to get URL:', error)
      return null
    }
  }

  /**
   * Clear URL cache for a music
   */
  async clearMusicUrl(musicId: string): Promise<void> {
    try {
      await removeUrlCacheByMusicId(musicId)
      console.log(`[Cache] Cleared URL cache for ${musicId}`)
    } catch (error) {
      console.error('[Cache] Failed to clear URL cache:', error)
    }
  }

  /**
   * Clear all URL cache
   */
  async clearAllUrlCache(): Promise<void> {
    try {
      await clearUrlCacheRecords()
      console.log('[Cache] Cleared all URL cache')
    } catch (error) {
      console.error('[Cache] Failed to clear all URL cache:', error)
    }
  }
}

/**
 * Lyric cache manager
 */
class LyricCache {
  /**
   * Save lyric to cache
   */
  async saveLyric(musicId: string, lyricInfo: any): Promise<void> {
    try {
      await saveLyricCacheRecord(musicId, JSON.stringify(lyricInfo))
      console.log(`[Cache] Saved lyric for ${musicId}`)
    } catch (error) {
      console.error('[Cache] Failed to save lyric:', error)
    }
  }

  /**
   * Get cached lyric
   */
  async getLyric(musicId: string): Promise<any | null> {
    try {
      const cached = await getLyricCacheRecord(musicId)
      if (!cached) {
        return null
      }
      console.log(`[Cache] Retrieved lyric for ${musicId}`)
      return JSON.parse(cached)
    } catch (error) {
      console.error('[Cache] Failed to get lyric:', error)
      return null
    }
  }

  /**
   * Clear lyric cache for one music id
   */
  async clearLyric(musicId: string): Promise<void> {
    try {
      await removeLyricCacheRecord(musicId)
      console.log(`[Cache] Cleared lyric cache for ${musicId}`)
    } catch (error) {
      console.error('[Cache] Failed to clear lyric cache:', error)
    }
  }

  /**
   * Clear all lyric cache
   */
  async clearAllLyricCache(): Promise<void> {
    try {
      await clearLyricCacheRecords()
      console.log('[Cache] Cleared all lyric cache')
    } catch (error) {
      console.error('[Cache] Failed to clear all lyric cache:', error)
    }
  }
}

export const musicUrlCache = new MusicUrlCache()
export const lyricCache = new LyricCache()

/**
 * Clear all cached data
 */
export const clearAllCache = async(): Promise<void> => {
  await Promise.all([
    musicUrlCache.clearAllUrlCache(),
    lyricCache.clearAllLyricCache(),
    audioFileCache.clearAllCachedAudio(),
  ])
  console.log('[Cache] Cleared all cache')
}
