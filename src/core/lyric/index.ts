/**
 * 歌词服务入口。
 * 提供带缓存的歌词获取，以及类型和工具函数的统一导出。
 */

import { Track } from '../../types/music'
import { lyricCache } from '../music/cache'
import { fetchLyric, LyricData } from './fetcher'

export type { LyricData } from './fetcher'
export type { LyricLine } from './parser'
export { findCurrentLineIndex } from './parser'

const EMPTY_LYRIC: LyricData = { lines: [], rawLrc: '', rawTlrc: '' }

/**
 * 获取歌词（优先读缓存，缓存未命中则请求 API 并写入缓存）。
 * @param track - 当前播放歌曲
 */
export async function getLyric(track: Track): Promise<LyricData> {
  const cacheKey = `${track.source || 'kw'}_${track.songmid || track.id}`

  try {
    const cached = await lyricCache.getLyric(cacheKey)
    if (cached?.lines?.length) return cached as LyricData
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
