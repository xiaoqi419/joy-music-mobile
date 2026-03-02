/**
 * 歌词获取器。
 * 根据歌曲来源调用对应平台 API 获取歌词文本，
 * 返回已解析的 LyricLine 数组。
 */

import { Track } from '../../types/music'
import { LyricLine, parseLrc, mergeLyricTranslation } from './parser'
import { wyRequest } from '../discover/wyCrypto'
import { inflate } from 'pako'

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
const KW_NEW_LYRIC_URL = 'https://newlyric.kuwo.cn/newlyric.lrc'
const KW_NEW_LYRIC_XOR_KEY = 'yeelion'
const KW_WORD_TIME_TAG_RE = /<(-?\d+),(-?\d+)(?:,-?\d+)?>/g
const KW_LYRIC_TIME_LINE_RE = /^\[([\d:.]+)\](.*)$/
const KW_LYRIC_META_LINE_RE = /^\[(ver|ti|ar|al|offset|by|kuwo):/i
const CJK_CHAR_RE = /[\u4E00-\u9FFF]/g
const COMMON_CJK_CHAR_RE =
  /[\u7684\u4E00\u662F\u4E0D\u4E86\u5728\u4EBA\u6709\u6211\u4ED6\u8FD9\u4E2D\u5927\u6765\u4E0A\u56FD\u4E2A\u5230\u8BF4\u4EEC\u4E3A\u5B50\u548C\u4F60\u5730\u51FA\u9053\u4E5F\u65F6\u5E74\u5F97\u5C31\u90A3\u8981\u4E0B\u4EE5\u751F\u4F1A\u7740\u53BB\u4E4B\u8FC7\u5BB6\u5B66\u5BF9\u53EF\u5979\u91CC\u540E\u5C0F\u4E48\u5FC3\u591A\u5929\u800C\u80FD\u597D\u90FD\u7136\u6CA1\u65E5\u4E8E\u8D77\u8FD8\u53D1\u6210\u4E8B\u53EA\u4F5C\u5F53\u60F3\u770B\u6587\u65E0\u5F00\u624B\u5341\u7528\u4E3B\u884C\u65B9\u53C8\u5982\u524D\u6240\u672C\u89C1\u7ECF\u5934\u9762\u516C\u540C\u4E09\u5DF2\u8001\u4ECE\u52A8\u4E24\u957F\u77E5\u6C11\u6837\u73B0\u5206\u5C06\u5916\u4E8C\u7406\u7B49]/g
const BASE64_TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='

function buildLyricData(rawLrc: string, rawTlrc = ''): LyricData {
  if (!rawLrc) return EMPTY_LYRIC

  let lines = parseLrc(rawLrc)
  if (rawTlrc) {
    const translations = parseLrc(rawTlrc)
    lines = mergeLyricTranslation(lines, translations)
  }
  return { lines, rawLrc, rawTlrc }
}

function countMatches(text: string, pattern: RegExp): number {
  const matched = text.match(pattern)
  return matched ? matched.length : 0
}

export function isLikelyGarbledLyric(input: string): boolean {
  const content = String(input || '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, '')

  if (content.length < 12) return false

  const total = content.length
  const replacementCount = countMatches(content, /\uFFFD/g)
  if (replacementCount >= 1) {
    return true
  }

  const kunGlyphCount = countMatches(content, /\u951F/g)
  if (kunGlyphCount >= 2 && kunGlyphCount / total > 0.015) {
    return true
  }

  const latinMojibakeLeadCount = countMatches(content, /[\u00C2\u00C3\u00E2]/g)
  if (
    latinMojibakeLeadCount >= 4 &&
    latinMojibakeLeadCount / total > 0.05
  ) {
    return true
  }

  const latinSupplementCount = countMatches(content, /[\u00C0-\u00FF]/g)
  if (latinSupplementCount >= 8 && latinSupplementCount / total > 0.12) {
    return true
  }

  const cjkCount = countMatches(content, CJK_CHAR_RE)
  if (cjkCount >= 16) {
    const commonCjkCount = countMatches(content, COMMON_CJK_CHAR_RE)
    if (commonCjkCount / cjkCount < 0.02) {
      return true
    }
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

interface KwLyricLine {
  timeMs: number
  text: string
}

const KW_HTML_ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#039;': "'",
  '&#39;': "'",
}

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(nbsp|amp|lt|gt|quot|apos|#039|#39);/gi, (token) => {
    const normalized = token.toLowerCase()
    return KW_HTML_ENTITY_MAP[normalized] ?? token
  })
}

function normalizeKwLyricText(raw: unknown): string {
  return decodeHtmlEntities(String(raw ?? ''))
    .replace(/\u0000/g, '')
    .trim()
}

function parseKwSecondsToMs(raw: unknown): number | undefined {
  const value = Number.parseFloat(String(raw ?? '').trim())
  if (!Number.isFinite(value)) return undefined
  return Math.max(0, Math.round(value * 1000))
}

function parseLrcTimestampToMs(raw: string): number | undefined {
  const matched = String(raw || '').trim().match(/^(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/)
  if (!matched) return undefined

  const minute = Number.parseInt(matched[1], 10)
  const second = Number.parseInt(matched[2], 10)
  const milli = Number.parseInt((matched[3] || '0').padEnd(3, '0').slice(0, 3), 10)
  if (!Number.isFinite(minute) || !Number.isFinite(second) || !Number.isFinite(milli)) {
    return undefined
  }
  return minute * 60000 + second * 1000 + milli
}

function formatLrcTimestamp(totalMs: number): string {
  const ms = Math.max(0, Math.round(totalMs))
  const minute = Math.floor(ms / 60000)
  const second = Math.floor((ms % 60000) / 1000)
  const milli = ms % 1000
  return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.${String(milli).padStart(3, '0')}`
}

function splitKwMainAndTranslationLines(lines: KwLyricLine[]): {
  lrc: KwLyricLine[]
  lrcT: KwLyricLine[]
} {
  const timeSet = new Set<number>()
  const lrc: KwLyricLine[] = []
  const lrcT: KwLyricLine[] = []

  for (const line of lines) {
    if (timeSet.has(line.timeMs)) {
      if (lrc.length < 2) continue
      const moved = lrc.pop()
      if (moved) {
        const previousTime = lrc[lrc.length - 1]?.timeMs ?? moved.timeMs
        lrcT.push({ ...moved, timeMs: previousTime })
      }
      lrc.push(line)
    } else {
      lrc.push(line)
      timeSet.add(line.timeMs)
    }
  }

  return { lrc, lrcT }
}

function buildRawLrcFromKwLines(lines: KwLyricLine[], tags: string[] = []): string {
  const body = lines
    .map((line) => `[${formatLrcTimestamp(line.timeMs)}]${line.text}`)
    .join('\n')
    .trim()
  if (!body) return ''
  if (!tags.length) return body
  return `${tags.join('\n')}\n${body}`
}

function buildKwLyricData(lines: KwLyricLine[], tags: string[] = []): LyricData {
  if (!lines.length) return EMPTY_LYRIC
  const { lrc, lrcT } = splitKwMainAndTranslationLines(lines)
  const rawLrc = buildRawLrcFromKwLines(lrc, tags)
  if (!rawLrc) return EMPTY_LYRIC
  const rawTlrc = lrcT.length ? buildRawLrcFromKwLines(lrcT, tags) : ''
  return buildLyricData(rawLrc, rawTlrc)
}

function decodeBase64Bytes(base64Text: string): Uint8Array {
  const clean = String(base64Text || '').replace(/\s+/g, '')
  if (!clean) return new Uint8Array()

  const binary =
    typeof globalThis.atob === 'function'
      ? globalThis.atob(clean)
      : decodeBase64Binary(clean)
  const output = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index)
  }
  return output
}

function encodeBase64Binary(input: string): string {
  let output = ''
  let index = 0
  while (index < input.length) {
    const chr1 = input.charCodeAt(index++)
    const chr2 = input.charCodeAt(index++)
    const chr3 = input.charCodeAt(index++)

    const enc1 = chr1 >> 2
    const enc2 = ((chr1 & 3) << 4) | (chr2 >> 4)
    let enc3 = ((chr2 & 15) << 2) | (chr3 >> 6)
    let enc4 = chr3 & 63

    if (Number.isNaN(chr2)) {
      enc3 = 64
      enc4 = 64
    } else if (Number.isNaN(chr3)) {
      enc4 = 64
    }

    output +=
      BASE64_TABLE.charAt(enc1) +
      BASE64_TABLE.charAt(enc2) +
      BASE64_TABLE.charAt(enc3) +
      BASE64_TABLE.charAt(enc4)
  }
  return output
}

function encodeBase64Bytes(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }
  if (typeof globalThis.btoa === 'function') return globalThis.btoa(binary)
  return encodeBase64Binary(binary)
}

function xorBytesWithKey(bytes: Uint8Array, key: string): Uint8Array {
  const keyBytes = new Uint8Array(key.length)
  for (let index = 0; index < key.length; index += 1) {
    keyBytes[index] = key.charCodeAt(index)
  }

  const output = new Uint8Array(bytes.length)
  for (let index = 0; index < bytes.length; index += 1) {
    output[index] = bytes[index] ^ keyBytes[index % keyBytes.length]
  }
  return output
}

function findBytesIndex(source: Uint8Array, pattern: number[]): number {
  if (!pattern.length || source.length < pattern.length) return -1
  for (let index = 0; index <= source.length - pattern.length; index += 1) {
    let matched = true
    for (let offset = 0; offset < pattern.length; offset += 1) {
      if (source[index + offset] !== pattern[offset]) {
        matched = false
        break
      }
    }
    if (matched) return index
  }
  return -1
}

function decodeBytesByEncoding(bytes: Uint8Array, encoding: string): string | undefined {
  if (typeof globalThis.TextDecoder !== 'function') return undefined
  try {
    return new TextDecoder(encoding).decode(bytes)
  } catch {
    return undefined
  }
}

function buildKwNewlyricQuery(songmid: string, isGetLyricx = true): string {
  let params = `user=12345,web,web,web&requester=localhost&req=1&rid=MUSIC_${songmid}`
  if (isGetLyricx) params += '&lrcx=1'

  const keyBytes = new Uint8Array(KW_NEW_LYRIC_XOR_KEY.length)
  for (let index = 0; index < KW_NEW_LYRIC_XOR_KEY.length; index += 1) {
    keyBytes[index] = KW_NEW_LYRIC_XOR_KEY.charCodeAt(index)
  }
  const sourceBytes = new Uint8Array(params.length)
  for (let index = 0; index < params.length; index += 1) {
    sourceBytes[index] = params.charCodeAt(index)
  }

  const output = new Uint16Array(sourceBytes.length)
  let sourceIndex = 0
  while (sourceIndex < sourceBytes.length) {
    let keyIndex = 0
    while (keyIndex < keyBytes.length && sourceIndex < sourceBytes.length) {
      output[sourceIndex] = keyBytes[keyIndex] ^ sourceBytes[sourceIndex]
      sourceIndex += 1
      keyIndex += 1
    }
  }

  return encodeBase64Bytes(new Uint8Array(output.buffer))
}

function decodeKwNewlyricRaw(raw: Uint8Array, isGetLyricx: boolean): string | undefined {
  const header = decodeBytesByEncoding(raw.subarray(0, 10), 'utf-8') || ''
  if (!header.startsWith('tp=content')) return undefined

  const separator = findBytesIndex(raw, [13, 10, 13, 10])
  if (separator < 0) return undefined

  const compressed = raw.subarray(separator + 4)
  const inflated = inflate(compressed)
  let lyricBytes = inflated instanceof Uint8Array ? inflated : new Uint8Array(inflated)
  if (!lyricBytes.length) return undefined

  if (isGetLyricx) {
    const base64Payload = (decodeBytesByEncoding(lyricBytes, 'utf-8') || '').trim()
    if (!base64Payload) return undefined
    lyricBytes = xorBytesWithKey(decodeBase64Bytes(base64Payload), KW_NEW_LYRIC_XOR_KEY)
  }

  const decoded =
    decodeBytesByEncoding(lyricBytes, 'gb18030') ||
    decodeBytesByEncoding(lyricBytes, 'gbk')
  return decoded?.trim()
}

function parseKwNewlyricText(raw: string): LyricData {
  const tags: string[] = []
  const lines: KwLyricLine[] = []

  for (const line of String(raw || '').split(/\r\n|\r|\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (KW_LYRIC_META_LINE_RE.test(trimmed)) {
      tags.push(trimmed)
      continue
    }

    const matched = trimmed.match(KW_LYRIC_TIME_LINE_RE)
    if (!matched) continue

    const timeMs = parseLrcTimestampToMs(matched[1])
    if (timeMs === undefined) continue

    const text = normalizeKwLyricText(matched[2]).replace(KW_WORD_TIME_TAG_RE, '')
    lines.push({ timeMs, text })
  }

  return buildKwLyricData(lines, tags)
}

async function fetchKwLyricFromSongInfo(songmid: string): Promise<LyricData> {
  const json = await requestJson<any>(
    `https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${songmid}`,
    {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }
  )
  const lrclist: Array<{ lineLyric?: string; time?: string }> = json?.data?.lrclist
  if (!Array.isArray(lrclist) || !lrclist.length) return EMPTY_LYRIC

  const lines: KwLyricLine[] = []
  for (const item of lrclist) {
    const timeMs = parseKwSecondsToMs(item?.time)
    if (timeMs === undefined) continue
    lines.push({
      timeMs,
      text: normalizeKwLyricText(item?.lineLyric),
    })
  }

  return buildKwLyricData(lines)
}

async function fetchKwLyricFromNewlyric(songmid: string): Promise<LyricData> {
  const query = buildKwNewlyricQuery(songmid, true)
  const resp = await fetch(`${KW_NEW_LYRIC_URL}?${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!resp.ok) return EMPTY_LYRIC

  const raw = new Uint8Array(await resp.arrayBuffer())
  const decoded = decodeKwNewlyricRaw(raw, true)
  if (!decoded) return EMPTY_LYRIC
  return parseKwNewlyricText(decoded)
}

/**
 * 获取 KW（酷我）歌词。
 * 复刻 CeruMusic 行为：优先走 newlyric 官方接口，失败后回退 songinfoandlrc。
 * @param songmid - 歌曲 ID
 */
async function fetchKwLyric(songmid: string): Promise<LyricData> {
  let newlyricData = EMPTY_LYRIC
  try {
    newlyricData = await fetchKwLyricFromNewlyric(songmid)
    if (newlyricData.lines.length) {
      console.log(`[LyricFetcher] KW lyric hit: newlyric (${songmid})`)
      return newlyricData
    }
  } catch {
    newlyricData = EMPTY_LYRIC
  }

  let songInfoLyric = EMPTY_LYRIC
  try {
    songInfoLyric = await fetchKwLyricFromSongInfo(songmid)
    if (songInfoLyric.lines.length) {
      console.log(`[LyricFetcher] KW lyric hit: songinfoandlrc (${songmid})`)
      return songInfoLyric
    }
  } catch {
    songInfoLyric = EMPTY_LYRIC
  }

  console.warn(`[LyricFetcher] KW lyric empty from official APIs (${songmid})`)
  return EMPTY_LYRIC
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
        return await fetchKwLyric(songmid)
      case 'wy':
        return await fetchWyLyric(songmid)
      case 'tx':
        return await fetchTxLyric(songmid)
      case 'kg':
        return await fetchKgLyric(track)
      case 'mg':
        return await fetchMgLyric(track)
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
