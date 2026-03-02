/**
 * 歌词获取器。
 * 根据歌曲来源调用对应平台 API 获取歌词文本，
 * 返回已解析的 LyricLine 数组。
 */

import { Track } from '../../types/music'
import {
  ImportedMusicSource,
  loadMusicSourceSettings,
} from '../config/musicSource'
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
const TX_OFFICIAL_LYRIC_URL =
  'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg'
const TX_OFFICIAL_LYRIC_HEADERS = {
  Referer: 'https://y.qq.com/',
  Origin: 'https://y.qq.com',
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
}
const MG_RESOURCE_INFO_URL =
  'https://c.musicapp.migu.cn/MIGUM2.0/v1.0/content/resourceinfo.do?resourceType=2'
const KG_HEADERS = {
  'KG-RC': '1',
  'KG-THash': 'expand_search_manager.cpp:852736169:451',
  'User-Agent': 'KuGou2012-9020-ExpandSearchManager',
}
const MG_TEXT_HEADERS = {
  Referer: 'https://app.c.nf.migu.cn/',
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 5.1.1; Nexus 6 Build/LYZ28E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.115 Mobile Safari/537.36',
  channel: '0146921',
}
const BASE64_TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='

function normalizeApiBaseUrl(apiUrl: string): string {
  const normalized = String(apiUrl || '').trim().replace(/\/+$/, '')
  return normalized.replace(/\/music\/(?:url|lyric)$/i, '')
}

function orderedImportedSources(
  selectedSourceId: string,
  importedSources: ImportedMusicSource[]
): ImportedMusicSource[] {
  const enabled = importedSources.filter((item) => item.enabled && item.apiUrl)
  if (!enabled.length) return []

  const selected = selectedSourceId
    ? enabled.find((item) => item.id === selectedSourceId)
    : enabled[0]
  if (!selected) return enabled
  return [selected, ...enabled.filter((item) => item.id !== selected.id)]
}

function extractLyricPayload(
  payload: any
): { rawLrc: string; rawTlrc: string } {
  const rawLrc = decodeMaybeBase64Lyric(String(
    payload?.data?.lyric ||
      payload?.data?.lrc ||
      payload?.lyric ||
      payload?.lrc ||
      ''
  ))
  const rawTlrc = decodeMaybeBase64Lyric(String(
    payload?.data?.trans ||
      payload?.data?.tlyric ||
      payload?.trans ||
      payload?.tlyric ||
      ''
  ))
  return { rawLrc, rawTlrc }
}

function buildLyricData(rawLrc: string, rawTlrc = ''): LyricData {
  if (!rawLrc) return EMPTY_LYRIC

  let lines = parseLrc(rawLrc)
  if (rawTlrc) {
    const translations = parseLrc(rawTlrc)
    lines = mergeLyricTranslation(lines, translations)
  }
  return { lines, rawLrc, rawTlrc }
}

function isLikelyGarbledLyric(input: string): boolean {
  const content = String(input || '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, '')

  if (content.length < 12) return false

  const replacementCount = (content.match(/�/g) || []).length
  if (replacementCount >= 2 && replacementCount / content.length > 0.015) {
    return true
  }

  const mojibakeCount = (content.match(/[ÃÂÐÊÍÅÒÓÔÕÖ×ØÙÚÛÜÝÞß]/g) || []).length
  if (mojibakeCount >= 4 && mojibakeCount / content.length > 0.05) {
    return true
  }

  return false
}

function decodeBase64Binary(input: string): string {
  const clean = input.replace(/[^A-Za-z0-9+/=]/g, '')
  let output = ''
  let index = 0

  while (index < clean.length) {
    const enc1 = BASE64_TABLE.indexOf(clean.charAt(index++))
    const enc2 = BASE64_TABLE.indexOf(clean.charAt(index++))
    const enc3 = BASE64_TABLE.indexOf(clean.charAt(index++))
    const enc4 = BASE64_TABLE.indexOf(clean.charAt(index++))

    const chr1 = (enc1 << 2) | (enc2 >> 4)
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2)
    const chr3 = ((enc3 & 3) << 6) | enc4

    output += String.fromCharCode(chr1)
    if (enc3 !== 64) output += String.fromCharCode(chr2)
    if (enc4 !== 64) output += String.fromCharCode(chr3)
  }
  return output
}

function decodeBase64Utf8(input: string): string {
  if (!input) return ''
  const binary =
    typeof globalThis.atob === 'function'
      ? globalThis.atob(input)
      : decodeBase64Binary(input)

  try {
    const percentEncoded = Array.from(binary)
      .map(char => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join('')
    return decodeURIComponent(percentEncoded)
  } catch {
    return binary
  }
}

function decodeMaybeBase64Lyric(input: string): string {
  const text = String(input || '').trim()
  if (!text) return ''
  if (/\[[0-9]{1,2}:[0-9]{1,2}/.test(text)) return text
  if (!/^[A-Za-z0-9+/=]+$/.test(text) || text.length % 4 !== 0) return text

  const decoded = decodeBase64Utf8(text).trim()
  if (!decoded) return text
  return decoded
}

function parseJsonOrJsonp(input: string): any {
  const text = String(input || '').trim()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/^[\w$.]+\(([\s\S]*)\)\s*;?$/)
    if (!match) throw new Error('invalid json/jsonp payload')
    return JSON.parse(match[1])
  }
}

async function requestJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, init)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${url}`)
  return (await resp.json()) as T
}

async function requestText(url: string, init?: RequestInit): Promise<string> {
  const resp = await fetch(url, init)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${url}`)
  return resp.text()
}

async function fetchLyricFromImportedSource(
  source: string,
  songmid: string
): Promise<LyricData> {
  const settings = await loadMusicSourceSettings()
  const candidates = orderedImportedSources(
    settings.selectedSourceId,
    settings.importedSources
  )
  if (!candidates.length) return EMPTY_LYRIC

  for (const sourceConfig of candidates) {
    try {
      const requestUrl = `${normalizeApiBaseUrl(sourceConfig.apiUrl)}/music/lyric`
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (sourceConfig.apiKey) {
        headers['X-Api-Key'] = sourceConfig.apiKey
      }

      const payload = await requestJson<any>(requestUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source,
          musicId: songmid,
        }),
      })

      const code = Number(payload?.code)
      if (Number.isFinite(code) && code !== 200) {
        continue
      }

      const { rawLrc, rawTlrc } = extractLyricPayload(payload)
      const lyricData = buildLyricData(rawLrc, rawTlrc)
      if (lyricData.lines.length) {
        console.log(
          `[LyricFetcher] Imported source lyric hit: ${sourceConfig.name || sourceConfig.id} (${source}:${songmid})`
        )
        return lyricData
      }
    } catch {
      // ignore and try next source
    }
  }

  return EMPTY_LYRIC
}

async function withImportedSourceFallback(
  source: string,
  songmid: string,
  primaryTask: () => Promise<LyricData>
): Promise<LyricData> {
  const primary = await primaryTask()
  if (primary.lines.length) return primary
  console.warn(
    `[LyricFetcher] Built-in lyric empty, trying imported sources (${source}:${songmid})`
  )
  return fetchLyricFromImportedSource(source, songmid)
}

async function fetchTxOfficialLyric(songmid: string): Promise<LyricData> {
  const query = new URLSearchParams({
    songmid,
    g_tk: '5381',
    format: 'json',
    inCharset: 'utf8',
    outCharset: 'utf-8',
    nobase64: '1',
    platform: 'yqq.json',
    needNewCode: '0',
    notice: '0',
  })

  const raw = await requestText(`${TX_OFFICIAL_LYRIC_URL}?${query.toString()}`, {
    headers: TX_OFFICIAL_LYRIC_HEADERS,
  })
  const payload = parseJsonOrJsonp(raw)
  const code = Number(payload?.code ?? payload?.retcode ?? 0)
  if (Number.isFinite(code) && code !== 0 && code !== 200) return EMPTY_LYRIC

  const rawLrc = decodeMaybeBase64Lyric(
    String(
      payload?.lyric ||
        payload?.data?.lyric ||
        payload?.lyric_lrc ||
        payload?.data?.lyric_lrc ||
        ''
    )
  )
  const rawTlrc = decodeMaybeBase64Lyric(
    String(
      payload?.trans ||
        payload?.data?.trans ||
        payload?.tlyric ||
        payload?.data?.tlyric ||
        payload?.lyric_translate ||
        payload?.data?.lyric_translate ||
        ''
    )
  )
  return buildLyricData(rawLrc, rawTlrc)
}

/**
 * 获取 KW（酷我）歌词。
 * 使用 m.kuwo.cn 简单 JSON 接口，无需加密。
 * @param songmid - 歌曲 ID
 */
async function fetchKwLyric(songmid: string): Promise<LyricData> {
  const json = await requestJson<any>(
    `https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${songmid}`,
    {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }
  )
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
  if (isLikelyGarbledLyric(rawLrc)) {
    console.warn(
      `[LyricFetcher] KW lyric appears garbled, fallback to imported sources (${songmid})`
    )
    return EMPTY_LYRIC
  }

  return buildLyricData(rawLrc)
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
  return buildLyricData(rawLrc, rawTlrc)
}

/**
 * 获取 TX（QQ 音乐）歌词。
 * 优先使用 QQ 官方歌词接口，失败时由外层走导入音源兜底。
 */
async function fetchTxLyric(songmid: string): Promise<LyricData> {
  return fetchTxOfficialLyric(songmid)
}

/**
 * 获取 KG（酷狗）歌词（参考 CeruMusic：search + download）。
 * 优先下载 lrc，避免 krc 解析依赖。
 */
async function fetchKgLyric(track: Track): Promise<LyricData> {
  const hash = track.hash || ''
  if (!hash) return EMPTY_LYRIC

  const keyword = encodeURIComponent(track.title || '')
  const timeLength = Math.max(0, Math.round(track.duration || 0))
  const searchResp = await requestJson<any>(
    `https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${keyword}&hash=${hash}&timelength=${timeLength}&lrctxt=1`,
    { headers: KG_HEADERS }
  )

  const candidates = Array.isArray(searchResp?.candidates)
    ? searchResp.candidates
    : []
  if (!candidates.length) return EMPTY_LYRIC

  const selected =
    candidates.find(
      (item: any) =>
        !(Number(item?.krctype) === 1 && Number(item?.contenttype) !== 1)
    ) || candidates[0]

  if (!selected?.id || !selected?.accesskey) return EMPTY_LYRIC

  const downloadResp = await requestJson<any>(
    `https://lyrics.kugou.com/download?ver=1&client=pc&id=${selected.id}&accesskey=${selected.accesskey}&fmt=lrc&charset=utf8`,
    { headers: KG_HEADERS }
  )
  if (Number(downloadResp?.status) !== 200 || !downloadResp?.content) {
    return EMPTY_LYRIC
  }

  const rawLrc = decodeBase64Utf8(String(downloadResp.content))
  return buildLyricData(rawLrc)
}

async function fetchMgResource(resourceId: string): Promise<any | null> {
  const resp = await requestJson<any>(MG_RESOURCE_INFO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `resourceId=${encodeURIComponent(resourceId)}`,
  })
  if (resp?.code !== '000000') return null
  const resourceList = Array.isArray(resp?.resource) ? resp.resource : []
  return resourceList[0] ?? null
}

/**
 * 获取 MG（咪咕）歌词（参考 CeruMusic：resourceinfo -> lrcUrl）。
 */
async function fetchMgLyric(track: Track): Promise<LyricData> {
  const candidates: string[] = []
  if (track.songmid) candidates.push(track.songmid)
  if (track.id?.startsWith('mg_')) candidates.push(track.id.slice(3))
  if (track.copyrightId) candidates.push(track.copyrightId)

  const dedupCandidates = Array.from(new Set(candidates.filter(Boolean)))
  for (const resourceId of dedupCandidates) {
    const resource = await fetchMgResource(resourceId)
    if (!resource) continue

    const lrcUrl = String(resource?.lrcUrl || '')
    if (!lrcUrl) continue

    const rawLrc = (await requestText(lrcUrl, { headers: MG_TEXT_HEADERS })).trim()
    if (!rawLrc) continue

    const trcUrl = String(resource?.trcUrl || '')
    let rawTlrc = ''
    if (trcUrl) {
      try {
        rawTlrc = (
          await requestText(trcUrl, { headers: MG_TEXT_HEADERS })
        ).trim()
      } catch {
        rawTlrc = ''
      }
    }
    return buildLyricData(rawLrc, rawTlrc)
  }
  return EMPTY_LYRIC
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
        return await withImportedSourceFallback(source, songmid, () =>
          fetchKwLyric(songmid)
        )
      case 'wy':
        return await withImportedSourceFallback(source, songmid, () =>
          fetchWyLyric(songmid)
        )
      case 'tx':
        return await withImportedSourceFallback(source, songmid, () =>
          fetchTxLyric(songmid)
        )
      case 'kg':
        return await withImportedSourceFallback(source, songmid, () =>
          fetchKgLyric(track)
        )
      case 'mg':
        return await withImportedSourceFallback(source, songmid, () =>
          fetchMgLyric(track)
        )
      default:
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
