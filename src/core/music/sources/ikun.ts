/**
 * Ikun music source adapter
 * Adapts ikun-music-source API to Joy Music Mobile
 */

import { Alert } from 'react-native'
import { MusicSourceAPI, Quality } from './source'

const API_URL = 'https://c.wwwweb.top'
const API_KEY = 'KAWANG_2544c96a-DEABFNVMBU4C0RAF'

// Music quality mapping from ikun source
const MUSIC_QUALITY = {
  kw: ['128k', '320k', 'flac', 'flac24bit', 'hires'],
  wy: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
  git: ['128k', '320k', 'flac'],
  kg: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
  tx: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master'],
}

interface IkunMusicInfo {
  hash?: string
  songmid?: string
  name: string
  singer: string
}

interface IkunResponse {
  code: number
  url?: string
  message?: string
}

/**
 * HTTP request helper
 * Uses fetch API (Expo compatible)
 */
const httpFetch = async(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: any
  } = {}
): Promise<{ code: number; url?: string; message?: string }> => {
  try {
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

    const response = await fetch(url, fetchOptions)
    const data = await response.json()

    return data
  } catch (error) {
    console.error('HTTP Fetch Error:', error)
    throw new Error(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Handle getting music URL from ikun API
 */
const handleGetMusicUrl = async(
  source: string,
  musicInfo: IkunMusicInfo,
  quality: Quality
): Promise<string> => {
  try {
    const songId = musicInfo.hash ?? musicInfo.songmid
    if (!songId) {
      throw new Error('Missing song ID')
    }

    const response = await httpFetch(`${API_URL}/music/url`, {
      method: 'POST',
      headers: {
        'X-Api-Key': API_KEY,
      },
      body: {
        source,
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
        console.log(`[IkunSource] Got URL for ${source}_${songId}: ${response.url}`)
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
  } catch (error) {
    console.error('[IkunSource] Error:', error)
    throw error
  }
}

/**
 * Ikun music source API implementation
 */
export const ikunMusicSource: MusicSourceAPI = {
  id: 'ikun',
  name: 'Ikun Music',

  async getMusicUrl(musicInfo: IkunMusicInfo, quality: Quality = '320k'): Promise<string> {
    // Try different sources in order of preference
    // Default to KW (Kuwo Music) as primary source
    const sourceId = musicInfo.source || 'kw'

    try {
      return await handleGetMusicUrl(sourceId, musicInfo, quality)
    } catch (error) {
      console.error(`[IkunSource] Failed to get URL from ${sourceId}:`, error)

      // Fallback to lower quality
      if (quality !== '128k') {
        const fallbackQualities: Quality[] = ['320k', '128k']
        for (const fallbackQuality of fallbackQualities) {
          if (fallbackQuality !== quality) {
            try {
              console.log(`[IkunSource] Retrying with ${fallbackQuality}`)
              return await handleGetMusicUrl(sourceId, musicInfo, fallbackQuality)
            } catch (fallbackError) {
              console.error(`[IkunSource] Fallback failed:`, fallbackError)
              continue
            }
          }
        }
      }

      throw error
    }
  },

  async getPicUrl(musicInfo: IkunMusicInfo): Promise<string> {
    // Return a placeholder or stored picture URL
    // In a real implementation, this would fetch from the API
    return musicInfo.picUrl || 'https://via.placeholder.com/300'
  },

  async getLyricInfo(musicInfo: IkunMusicInfo): Promise<any> {
    // Lyric fetching would be implemented similarly
    return {
      lyric: '',
      tlyric: '',
      rlyric: '',
    }
  },

  async search(keyword: string, page: number = 1, limit: number = 20): Promise<any> {
    // Search implementation would go here
    // For now, return empty results
    return {
      list: [],
      total: 0,
    }
  },
}
