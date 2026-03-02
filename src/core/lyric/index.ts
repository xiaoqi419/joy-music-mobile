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
 * 获取歌词（优先读缓存，缓存未命中则请求 API 并写入缓存）。
 * @param track - 当前播放歌曲
 */
export async function getLyric(track: Track): Promise<LyricData> {
  const cacheKey = `${track.source || 'kw'}_${track.songmid || track.id}`

  try {
    const cached = await lyricCache.getLyric(cacheKey)
    if (cached?.lines?.length) {
      const mergedText = buildLyricTextForGarbledCheck(cached as LyricData)
      if (!isLikelyGarbledLyric(mergedText)) {
        return cached as LyricData
      }
      console.warn(`[Lyric] Cached lyric appears garbled, evicting cache for ${cacheKey}`)
      await lyricCache.clearLyric(cacheKey)
    }
  } catch {
    // cache miss, continue to fetch
  }

  const lyricData = await fetchLyric(track)

  if (lyricData.lines.length) {
    try {
      await lyricCache.saveLyric(cacheKey, lyricData)
    } catch {
      // cache write failure is non-critical
    }
  }

  return lyricData
}
