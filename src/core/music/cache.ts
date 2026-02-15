/**
 * Music URL and data caching system
 * Implements multi-layer caching strategy
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { Quality } from './source'

const CACHE_PREFIX = '@joy_music_'
const URL_CACHE_PREFIX = `${CACHE_PREFIX}url_`
const LYRIC_CACHE_PREFIX = `${CACHE_PREFIX}lyric_`

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
      const data: CachedMusicUrl = {
        url,
        quality,
        timestamp: Date.now(),
        source,
      }
      await AsyncStorage.setItem(key, JSON.stringify(data))
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
      const cached = await AsyncStorage.getItem(key)

      if (!cached) {
        return null
      }

      const data: CachedMusicUrl = JSON.parse(cached)

      // 检查是否过期
      if (Date.now() - data.timestamp > URL_CACHE_TTL) {
        console.log(`[Cache] URL expired for ${musicId} (${quality}), clearing`)
        await AsyncStorage.removeItem(key)
        return null
      }

      console.log(`[Cache] Retrieved URL for ${musicId} (${quality})`)
      return data.url
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
      const keys = await AsyncStorage.getAllKeys()
      const urlKeys = keys.filter(key =>
        key.startsWith(URL_CACHE_PREFIX) && key.includes(musicId)
      )

      await AsyncStorage.multiRemove(urlKeys)
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
      const keys = await AsyncStorage.getAllKeys()
      const urlKeys = keys.filter(key => key.startsWith(URL_CACHE_PREFIX))

      await AsyncStorage.multiRemove(urlKeys)
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
      const key = `${LYRIC_CACHE_PREFIX}${musicId}`
      await AsyncStorage.setItem(key, JSON.stringify(lyricInfo))
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
      const key = `${LYRIC_CACHE_PREFIX}${musicId}`
      const cached = await AsyncStorage.getItem(key)

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
   * Clear all lyric cache
   */
  async clearAllLyricCache(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys()
      const lyricKeys = keys.filter(key => key.startsWith(LYRIC_CACHE_PREFIX))

      await AsyncStorage.multiRemove(lyricKeys)
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
  ])
  console.log('[Cache] Cleared all cache')
}
