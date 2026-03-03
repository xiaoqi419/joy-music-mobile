/**
 * 歌词服务入口。
 * 提供带缓存的歌词获取，以及类型和工具函数的统一导出。
 */

import { Track } from '../../types/music'
import { lyricCache } from '../music/cache'
import { fetchLyric, isLikelyGarbledLyric, LyricData } from './fetcher'

export type { LyricData } from './fetcher'
export type { LyricLine } from './parser'
export { findCurrentLineIndex } from './parser'

const EMPTY_LYRIC: LyricData = { lines: [], rawLrc: '', rawTlrc: '' }

/**
 * 内存缓存：同一首歌的 getLyric 调用直接返回已解析结果，
 * 避免 MiniPlayer 与 NowPlaying 同时请求同一首歌的歌词。
 * 同时合并并发请求（in-flight dedup）。
 */
const memoryCache = new Map<string, LyricData>()
const inFlightRequests = new Map<string, Promise<LyricData>>()
const MEMORY_CACHE_MAX = 30

function buildLyricTextForGarbledCheck(cached: LyricData): string {
  const rawLrc = String(cached?.rawLrc || '')
  const rawTlrc = String(cached?.rawTlrc || '')
  const lineTexts = Array.isArray(cached?.lines)
    ? cached.lines
      .slice(0, 80)
      .map((line) => `${line?.text || ''} ${line?.translation || ''}`.trim())
      .join('\n')
    : ''
  return [rawLrc, rawTlrc, lineTexts].filter(Boolean).join('\n')
}

/**
 * 获取歌词（优先内存缓存 → 磁盘缓存 → API 请求）。
 * 同一 cacheKey 的并发请求会自动合并，避免重复网络调用。
 * @param track - 当前播放歌曲
 */
export async function getLyric(track: Track): Promise<LyricData> {
  const cacheKey = `${track.source || 'kw'}_${track.songmid || track.id}`

  // 1. 内存命中
  const memoryCached = memoryCache.get(cacheKey)
  if (memoryCached) return memoryCached

  // 2. 合并并发请求
  const inFlight = inFlightRequests.get(cacheKey)
  if (inFlight) return inFlight

  const request = (async (): Promise<LyricData> => {
    try {
      const cached = await lyricCache.getLyric(cacheKey)
      if (cached?.lines?.length) {
        const mergedText = buildLyricTextForGarbledCheck(cached as LyricData)
        if (!isLikelyGarbledLyric(mergedText)) {
          const result = cached as LyricData
          storeInMemoryCache(cacheKey, result)
          return result
        }
        console.warn(`[Lyric] Cached lyric appears garbled, evicting cache for ${cacheKey}`)
        await lyricCache.clearLyric(cacheKey)
      }
    } catch {
      // cache miss, continue to fetch
    }

    const lyricData = await fetchLyric(track)

    if (lyricData.lines.length) {
      storeInMemoryCache(cacheKey, lyricData)
      try {
        await lyricCache.saveLyric(cacheKey, lyricData)
      } catch {
        // cache write failure is non-critical
      }
    }

    return lyricData
  })()

  inFlightRequests.set(cacheKey, request)
  try {
    return await request
  } finally {
    inFlightRequests.delete(cacheKey)
  }
}

function storeInMemoryCache(key: string, data: LyricData): void {
  if (memoryCache.size >= MEMORY_CACHE_MAX) {
    // 淘汰最早的条目
    const firstKey = memoryCache.keys().next().value
    if (firstKey !== undefined) memoryCache.delete(firstKey)
  }
  memoryCache.set(key, data)
}
