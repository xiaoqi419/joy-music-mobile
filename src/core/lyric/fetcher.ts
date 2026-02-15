/**
 * 歌词获取器。
 * 根据歌曲来源（KW/WY）调用不同 API 获取歌词文本，
 * 返回已解析的 LyricLine 数组。
 */

import { Track } from '../../types/music'
import { LyricLine, parseLrc, mergeLyricTranslation } from './parser'
import { wyRequest } from '../discover/wyCrypto'

/** 歌词数据 */
export interface LyricData {
  /** 已解析的歌词行 */
  lines: LyricLine[]
  /** 原始 LRC 文本 */
  rawLrc: string
  /** 原始翻译 LRC 文本 */
  rawTlrc: string
}

const EMPTY_LYRIC: LyricData = { lines: [], rawLrc: '', rawTlrc: '' }

/**
 * 获取 KW（酷我）歌词。
 * 使用 m.kuwo.cn 简单 JSON 接口，无需加密。
 * @param songmid - 歌曲 ID
 */
async function fetchKwLyric(songmid: string): Promise<LyricData> {
  const resp = await fetch(
    `http://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${songmid}`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  )
  const json = await resp.json()
  const lrclist: Array<{ lineLyric?: string; time?: string }> =
    json?.data?.lrclist

  if (!Array.isArray(lrclist) || !lrclist.length) return EMPTY_LYRIC

  const lrcLines: string[] = []
  for (const item of lrclist) {
    const timeSec = parseFloat(item.time || '0')
    const totalMs = Math.round(timeSec * 1000)
    const m = Math.floor(totalMs / 60000)
    const s = Math.floor((totalMs % 60000) / 1000)
    const ms = totalMs % 1000
    const tag = `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}]`
    lrcLines.push(`${tag}${item.lineLyric || ''}`)
  }

  const rawLrc = lrcLines.join('\n')
  const lines = parseLrc(rawLrc)
  return { lines, rawLrc, rawTlrc: '' }
}

/**
 * 获取 WY（网易云）歌词。
 * 通过已有 linuxapi 加密通道请求歌词接口。
 * @param songmid - 歌曲 ID
 */
async function fetchWyLyric(songmid: string): Promise<LyricData> {
  const resp = await wyRequest('https://music.163.com/api/song/lyric', {
    id: songmid,
    lv: -1,
    tv: -1,
    rv: -1,
    kv: -1,
  })

  const data = resp.data
  if (data?.code !== 200) return EMPTY_LYRIC

  const rawLrc: string = data?.lrc?.lyric || ''
  const rawTlrc: string = data?.tlyric?.lyric || ''

  let lines = parseLrc(rawLrc)
  if (rawTlrc) {
    const translations = parseLrc(rawTlrc)
    lines = mergeLyricTranslation(lines, translations)
  }

  return { lines, rawLrc, rawTlrc }
}

/**
 * 根据歌曲信息获取歌词。
 * @param track - 当前播放歌曲
 * @returns 歌词数据；获取失败返回空歌词
 */
export async function fetchLyric(track: Track): Promise<LyricData> {
  const source = track.source || 'kw'
  const songmid = track.songmid || track.id

  if (!songmid) return EMPTY_LYRIC

  try {
    switch (source) {
      case 'kw':
        return await fetchKwLyric(songmid)
      case 'wy':
        return await fetchWyLyric(songmid)
      default:
        // TX/KG/MG 暂未实现
        return EMPTY_LYRIC
    }
  } catch (error) {
    console.error(
      `[LyricFetcher] Failed to fetch lyric for ${source}:${songmid}`,
      error
    )
    return EMPTY_LYRIC
  }
}
