/**
 * 搜索模块
 * 对接多平台搜索与热搜词接口，统一返回可直接播放的 Track 数据结构。
 */

import { DiscoverSourceId } from '../../types/discover'
import { SearchResult, Track } from '../../types/music'
import { httpRequest, withRetry } from '../discover/http'
import { wyRequest } from '../discover/wyCrypto'
import CryptoJS from 'crypto-js'

interface SearchOptions {
  query: string
  source?: DiscoverSourceId
  limit?: number
  offset?: number
  page?: number
}

export interface SearchTracksOptions {
  query: string
  source: DiscoverSourceId
  page?: number
  limit?: number
}

export interface SearchTracksPageResult {
  list: Track[]
  total: number
  page: number
  limit: number
  hasMore: boolean
  source: DiscoverSourceId
}

const DEFAULT_LIMIT = 20

const buildNoMoreResult = (
  source: DiscoverSourceId,
  page: number,
  limit: number,
  totalHint = 0
): SearchTracksPageResult => ({
  list: [],
  total: Math.max(toNumber(totalHint), (page - 1) * limit, 0),
  page,
  limit,
  hasMore: false,
  source,
})

const HOT_KEYWORDS_FALLBACK: string[] = [
  '周杰伦',
  '林俊杰',
  '陈奕迅',
  'Taylor Swift',
  'Bruno Mars',
  'NewJeans',
  '告五人',
  'Aimer',
  'YOASOBI',
  '伍佰',
]

type SearchHandler = (query: string, page: number, limit: number) => Promise<SearchTracksPageResult>
type HotSearchHandler = (limit: number) => Promise<string[]>

const SEARCH_HANDLERS: Partial<Record<DiscoverSourceId, SearchHandler>> = {
  kw: searchKw,
  wy: searchWy,
  tx: searchTx,
  kg: searchKg,
}

const HOT_SEARCH_HANDLERS: Partial<Record<DiscoverSourceId, HotSearchHandler>> = {
  kw: getKwHotSearch,
  wy: getWyHotSearch,
  tx: getTxHotSearch,
  kg: getKgHotSearch,
}

const stripHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .trim()

const decodeHtml = (value: unknown): string =>
  stripHtml(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')

const toNumber = (value: unknown, fallback = 0): number => {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

const toDurationMsFromSeconds = (value: unknown): number => Math.max(0, Math.floor(toNumber(value) * 1000))

const toDurationMs = (value: unknown): number => Math.max(0, Math.floor(toNumber(value)))

const TX_SIGN_PART_1_INDEXES = [23, 14, 6, 36, 16, 40, 7, 19]
const TX_SIGN_PART_2_INDEXES = [16, 1, 32, 12, 19, 27, 8, 5]
const TX_SIGN_SCRAMBLE_VALUES = [
  89, 39, 179, 150, 218, 82, 58, 252, 177, 52,
  186, 123, 120, 64, 242, 133, 143, 161, 121, 179,
]

const txPickHashByIndexes = (hash: string, indexes: number[]): string =>
  indexes.map((idx) => hash[idx] || '').join('')

function txBytesToBase64(bytes: number[]): string {
  const words: number[] = []
  for (let i = 0; i < bytes.length; i += 1) {
    words[i >>> 2] = (words[i >>> 2] || 0) | (bytes[i] << (24 - (i % 4) * 8))
  }
  const wordArray = CryptoJS.lib.WordArray.create(words, bytes.length)
  return CryptoJS.enc.Base64.stringify(wordArray).replace(/[\\/+=]/g, '')
}

function createTxSign(payload: unknown): string {
  const text = JSON.stringify(payload)
  const hash = CryptoJS.SHA1(text).toString(CryptoJS.enc.Hex).toUpperCase()
  const part1 = txPickHashByIndexes(hash, TX_SIGN_PART_1_INDEXES)
  const part2 = txPickHashByIndexes(hash, TX_SIGN_PART_2_INDEXES)
  const mixedBytes = TX_SIGN_SCRAMBLE_VALUES.map(
    (value, index) => value ^ parseInt(hash.slice(index * 2, index * 2 + 2), 16)
  )
  const base64Part = txBytesToBase64(mixedBytes)
  return `zzc${part1}${base64Part}${part2}`.toLowerCase()
}

function createTxSearchId(): string {
  const randomInt = (min: number, max: number): number =>
    Math.floor(Math.random() * (max - min + 1)) + min
  const e = randomInt(1, 20)
  const t = e * Number('18014398509481984')
  const n = randomInt(0, 4194304) * 4294967296
  const timestamp = Date.now()
  const r = Math.round(timestamp * 1000) % (24 * 60 * 60 * 1000)
  return String(t + n + r)
}

const normalizeKwCover = (value: unknown): string | undefined => {
  const raw = String(value ?? '').trim()
  if (!raw) return undefined

  const toLargeSize = (text: string): string =>
    text
      .replace('/star/albumcover/120/', '/star/albumcover/500/')
      .replace('/albumcover/120/', '/albumcover/500/')
      .replace(/^120\//, '500/')

  if (/^https?:\/\//i.test(raw)) {
    return toLargeSize(raw)
  }

  const clean = toLargeSize(raw.replace(/^\/+/, ''))
  if (/^star\/albumcover\//i.test(clean)) {
    return `https://img4.kuwo.cn/${clean}`
  }
  return `https://img4.kuwo.cn/star/albumcover/${clean}`
}

const normalizeKgCover = (value: unknown): string | undefined => {
  const raw = String(value ?? '').trim()
  if (!raw) return undefined
  return raw
    .replace(/\{size\}/g, '480')
    .replace(/^http:\/\//i, 'https://')
}

const getKwCoverBySongmid = async (songmid: string): Promise<string | undefined> => {
  try {
    const resp = await withRetry(() =>
      httpRequest('http://artistpicserver.kuwo.cn/pic.web', {
        query: {
          corp: 'kuwo',
          type: 'rid_pic',
          pictype: 500,
          size: 500,
          rid: songmid,
        },
      })
    )
    const text = String(resp.data ?? '').trim()
    return /^https?:\/\//i.test(text) ? text : undefined
  } catch {
    return undefined
  }
}

const uniqueStrings = (items: string[]): string[] => {
  const uniq = new Set<string>()
  const result: string[] = []
  for (const item of items) {
    const text = item.trim()
    if (!text || uniq.has(text)) continue
    uniq.add(text)
    result.push(text)
  }
  return result
}

function parseKwQualityTypes(raw: unknown): Record<string, boolean> {
  const text = String(raw ?? '')
  if (!text) return {}

  const types: Record<string, boolean> = {}
  const regex = /bitrate:(\d+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    switch (match[1]) {
      case '4000':
        types.flac24bit = true
        break
      case '2000':
        types.flac = true
        break
      case '320':
        types['320k'] = true
        break
      case '128':
        types['128k'] = true
        break
      default:
        break
    }
  }

  return types
}

function mapKwTrack(item: any): Track | null {
  const rawRid = String(item?.MUSICRID || item?.musicrid || item?.DC_TARGETID || item?.rid || '')
  const songmid = rawRid.replace(/^MUSIC_/, '') || String(item?.id || '')
  if (!songmid) return null

  const cover = normalizeKwCover(
    item?.web_albumpic_short ||
      item?.albumpic ||
      item?.pic ||
      item?.web_artistpic_short ||
      item?.hts_MVPIC ||
      ''
  )
  const quality = parseKwQualityTypes(item?.N_MINFO || item?.minfo)

  const track: Track = {
    id: `kw_${songmid}`,
    title: decodeHtml(item?.SONGNAME || item?.name),
    artist: decodeHtml(item?.ARTIST || item?.artist),
    album: decodeHtml(item?.ALBUM || item?.album),
    duration: toDurationMsFromSeconds(item?.DURATION || item?.duration),
    url: '',
    coverUrl: cover,
    source: 'kw',
    songmid,
    picUrl: cover,
  }

  if (Object.keys(quality).length) {
    ;(track as any)._types = quality
  }

  return track
}

function mapWyTrack(item: any): Track | null {
  const songmid = String(item?.id || '')
  if (!songmid) return null

  const quality: Record<string, boolean> = {}
  if (item?.hr) quality.flac24bit = true
  if (item?.sq || item?.h) quality.flac = true
  if (item?.h) quality['320k'] = true
  if (item?.m || item?.l) quality['128k'] = true

  const track: Track = {
    id: `wy_${songmid}`,
    title: decodeHtml(item?.name),
    artist: Array.isArray(item?.ar)
      ? item.ar.map((s: any) => decodeHtml(s?.name)).filter(Boolean).join(' / ')
      : '',
    album: decodeHtml(item?.al?.name),
    duration: toDurationMs(item?.dt),
    url: '',
    coverUrl: item?.al?.picUrl || undefined,
    source: 'wy',
    songmid,
    picUrl: item?.al?.picUrl || undefined,
  }

  if (Object.keys(quality).length) {
    ;(track as any)._types = quality
  }

  return track
}

function mapTxTrack(item: any): Track | null {
  const songmid = String(item?.mid || item?.songmid || item?.id || '')
  if (!songmid) return null

  const albumMid = String(item?.album?.mid || '')
  const singerMid = String(item?.singer?.[0]?.mid || '')
  const coverByAlbum = albumMid
    ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumMid}.jpg`
    : ''
  const coverBySinger = singerMid
    ? `https://y.gtimg.cn/music/photo_new/T001R500x500M000${singerMid}.jpg`
    : ''
  const cover = coverByAlbum || coverBySinger || undefined

  const file = item?.file || {}
  const quality: Record<string, boolean> = {}
  if (toNumber(file?.size_hires) > 0 || toNumber(file?.size_new?.[0]) > 0) quality.flac24bit = true
  if (toNumber(file?.size_flac) > 0) quality.flac = true
  if (toNumber(file?.size_320mp3) > 0) quality['320k'] = true
  if (toNumber(file?.size_128mp3) > 0) quality['128k'] = true

  const track: Track = {
    id: `tx_${songmid}`,
    title: decodeHtml(`${item?.name || item?.title || ''}${item?.title_extra || ''}`),
    artist: Array.isArray(item?.singer)
      ? item.singer.map((s: any) => decodeHtml(s?.name)).filter(Boolean).join(' / ')
      : '',
    album: decodeHtml(item?.album?.name),
    duration: toDurationMsFromSeconds(item?.interval),
    url: '',
    coverUrl: cover,
    source: 'tx',
    songmid,
    picUrl: cover,
  }

  if (Object.keys(quality).length) {
    ;(track as any)._types = quality
  }

  return track
}

function mapKgTrack(item: any): Track | null {
  const hash = String(item?.FileHash || item?.hash || '').trim()
  const songmid = String(item?.Audioid || item?.audio_id || item?.songmid || '').trim()
  if (!hash && !songmid) return null

  const quality: Record<string, boolean> = {}
  if (item?.ResFileHash || item?.res_hash) quality.flac24bit = true
  if (item?.SQFileHash || item?.sq_hash) quality.flac = true
  if (item?.HQFileHash || item?.hq_hash) quality['320k'] = true
  quality['128k'] = true

  const cover = normalizeKgCover(
    item?.Image ||
      item?.img ||
      item?.album_img ||
      item?.trans_param?.union_cover ||
      ''
  )

  // KG 搜索结果里同一 audio_id 可能对应多个版本，必须把 hash 拼进 id，避免 React key 冲突。
  const idToken = `${songmid || 'na'}_${hash || 'na'}`
  const track: Track = {
    id: `kg_${idToken}`,
    title: decodeHtml(item?.SongName || item?.songname || item?.name),
    artist: decodeHtml(item?.SingerName || item?.singername || item?.author_name),
    album: decodeHtml(item?.AlbumName || item?.album_name),
    duration: toDurationMsFromSeconds(item?.Duration || item?.duration),
    url: '',
    coverUrl: cover,
    source: 'kg',
    songmid,
    hash,
    picUrl: cover,
  }

  ;(track as any)._types = quality
  return track
}

async function searchKw(query: string, page: number, limit: number): Promise<SearchTracksPageResult> {
  const resp = await withRetry(() =>
    httpRequest('http://search.kuwo.cn/r.s', {
      query: {
        client: 'kt',
        all: query,
        pn: page - 1,
        rn: limit,
        uid: 794762570,
        ver: 'kwplayer_ar_9.2.2.1',
        vipver: 1,
        show_copyright_off: 1,
        newver: 1,
        ft: 'music',
        cluster: 0,
        strategy: 2012,
        encoding: 'utf8',
        rformat: 'json',
        vermerge: 1,
        mobi: 1,
        issubtitle: 1,
      },
      headers: {
        'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 9;)',
      },
    })
  )

  const rawList = Array.isArray(resp.data?.abslist) ? resp.data.abslist : []
  let list = rawList.map(mapKwTrack).filter((item): item is Track => !!item)
  const rawTotal = toNumber(resp.data?.TOTAL, 0)

  // KW 超过最后一页时会返回 SHOW=0/TOTAL=0，不应当视为错误。
  if (page > 1 && rawList.length === 0 && rawTotal <= 0) {
    return buildNoMoreResult('kw', page, limit)
  }

  // 与 CeruMusic 的 pic 逻辑保持一致：当搜索接口缺失封面时，按 songmid 兜底拉取。
  const missingCoverTracks = list.filter(item => !item.coverUrl && item.songmid)
  if (missingCoverTracks.length) {
    const coverPairs = await Promise.all(
      missingCoverTracks.map(async item => ({
        id: item.id,
        cover: await getKwCoverBySongmid(String(item.songmid)),
      }))
    )
    const coverMap = new Map(coverPairs.filter(item => !!item.cover).map(item => [item.id, item.cover as string]))
    list = list.map(item => {
      const cover = coverMap.get(item.id)
      if (!cover) return item
      return {
        ...item,
        coverUrl: cover,
        picUrl: cover,
      }
    })
  }

  const total = rawTotal > 0 ? rawTotal : list.length

  return {
    list,
    total,
    page,
    limit,
    hasMore: page * limit < total,
    source: 'kw',
  }
}

async function searchWy(query: string, page: number, limit: number): Promise<SearchTracksPageResult> {
  const resp = await withRetry(() =>
    wyRequest('https://music.163.com/api/cloudsearch/pc', {
      s: query,
      type: 1,
      limit,
      total: page === 1,
      offset: (page - 1) * limit,
    })
  )
  if (resp.data?.code !== 200) {
    if (page > 1) {
      return buildNoMoreResult('wy', page, limit)
    }
    throw new Error('WY search API failed')
  }

  const songs = Array.isArray(resp.data?.result?.songs) ? resp.data.result.songs : []
  const list = songs.map(mapWyTrack).filter((item): item is Track => !!item)
  const rawTotal = toNumber(resp.data?.result?.songCount, 0)
  if (page > 1 && songs.length === 0 && rawTotal <= 0) {
    return buildNoMoreResult('wy', page, limit)
  }
  const total = rawTotal > 0 ? rawTotal : list.length

  return {
    list,
    total,
    page,
    limit,
    hasMore: page * limit < total,
    source: 'wy',
  }
}

async function searchTx(query: string, page: number, limit: number): Promise<SearchTracksPageResult> {
  const payload = {
    comm: {
      ct: '11',
      cv: '14090508',
      v: '14090508',
      tmeAppID: 'qqmusic',
      phonetype: 'EBG-AN10',
      deviceScore: '553.47',
      devicelevel: '50',
      newdevicelevel: '20',
      rom: 'HuaWei/EMOTION/EmotionUI_14.2.0',
      os_ver: '12',
      OpenUDID: '0',
      OpenUDID2: '0',
      QIMEI36: '0',
      udid: '0',
      chid: '0',
      aid: '0',
      oaid: '0',
      taid: '0',
      tid: '0',
      wid: '0',
      uid: '0',
      sid: '0',
      modeSwitch: '6',
      teenMode: '0',
      ui_mode: '2',
      nettype: '1020',
      v4ip: '',
    },
    req: {
      module: 'music.search.SearchCgiService',
      method: 'DoSearchForQQMusicMobile',
      param: {
        search_type: 0,
        searchid: createTxSearchId(),
        query,
        page_num: page,
        num_per_page: limit,
        highlight: 0,
        nqc_flag: 0,
        multi_zhida: 0,
        cat: 2,
        grp: 1,
        sin: 0,
        sem: 0,
      },
    },
  }

  const resp = await withRetry(async() => {
    // 优先走 CeruMusic 当前使用的签名接口，TX 搜索稳定性更高。
    const sign = createTxSign(payload)
    const signedResp = await httpRequest('https://u.y.qq.com/cgi-bin/musics.fcg', {
      method: 'POST',
      query: { sign },
      headers: {
        'User-Agent': 'QQMusic 14090508(android 12)',
      },
      body: payload,
    })
    if (signedResp.data?.code === 0 && signedResp.data?.req?.code === 0) {
      return signedResp
    }

    // 回退旧接口，兼容部分网络环境/节点策略。
    return httpRequest('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      headers: {
        Referer: 'https://y.qq.com/portal/player.html',
      },
      body: payload,
    })
  })

  if (resp.data?.code !== 0 || resp.data?.req?.code !== 0) {
    if (page > 1) {
      return buildNoMoreResult('tx', page, limit, resp.data?.req?.data?.meta?.sum)
    }
    throw new Error('TX search API failed')
  }

  const body = resp.data?.req?.data?.body || {}
  const rawList = Array.isArray(body?.item_song) ? body.item_song : []
  const rawTotal = toNumber(resp.data?.req?.data?.meta?.sum, 0)
  if (page > 1 && rawList.length === 0) {
    return buildNoMoreResult('tx', page, limit, rawTotal)
  }
  const list = rawList.map(mapTxTrack).filter((item): item is Track => !!item)
  const total = rawTotal > 0 ? rawTotal : list.length

  return {
    list,
    total,
    page,
    limit,
    hasMore: page * limit < total,
    source: 'tx',
  }
}

function flattenKgSearchResult(rawLists: any[]): any[] {
  const uniq = new Set<string>()
  const result: any[] = []

  for (const item of rawLists) {
    const key = `${item?.Audioid || ''}_${item?.FileHash || ''}`
    if (key && !uniq.has(key)) {
      uniq.add(key)
      result.push(item)
    }
    if (Array.isArray(item?.Grp)) {
      for (const child of item.Grp) {
        const childKey = `${child?.Audioid || ''}_${child?.FileHash || ''}`
        if (childKey && !uniq.has(childKey)) {
          uniq.add(childKey)
          result.push(child)
        }
      }
    }
  }

  return result
}

async function searchKg(query: string, page: number, limit: number): Promise<SearchTracksPageResult> {
  const resp = await withRetry(() =>
    httpRequest('https://songsearch.kugou.com/song_search_v2', {
      query: {
        keyword: query,
        page,
        pagesize: limit,
        userid: 0,
        clientver: '',
        platform: 'WebFilter',
        filter: 2,
        iscorrection: 1,
        privilege_filter: 0,
        area_code: 1,
      },
    })
  )

  if (resp.data?.error_code !== 0) {
    // KG 超过最后一页会返回 error_code=149，这里按“无更多数据”处理。
    if (page > 1) {
      return buildNoMoreResult('kg', page, limit, resp.data?.data?.total)
    }
    throw new Error('KG search API failed')
  }

  const rawLists = Array.isArray(resp.data?.data?.lists) ? resp.data.data.lists : []
  const rawTotal = toNumber(resp.data?.data?.total, 0)
  if (page > 1 && rawLists.length === 0) {
    return buildNoMoreResult('kg', page, limit, rawTotal)
  }
  const flattened = flattenKgSearchResult(rawLists)
  const list = flattened.map(mapKgTrack).filter((item): item is Track => !!item)
  const total = rawTotal > 0 ? rawTotal : list.length

  return {
    list,
    total,
    page,
    limit,
    hasMore: page * limit < total,
    source: 'kg',
  }
}

async function getKwHotSearch(limit: number): Promise<string[]> {
  const resp = await withRetry(() =>
    httpRequest('http://hotword.kuwo.cn/hotword.s', {
      query: {
        prod: 'kwplayer_ar_9.3.0.1',
        corp: 'kuwo',
        newver: 2,
        vipver: '9.3.0.1',
        source: 'kwplayer_ar_9.3.0.1_40.apk',
        p2p: 1,
        notrace: 0,
        uid: 0,
        plat: 'kwplayer_ar',
        rformat: 'json',
        encoding: 'utf8',
        tabid: 1,
      },
      headers: {
        'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 9;)',
      },
    })
  )

  if (resp.data?.status !== 'ok') {
    throw new Error('KW hot search API failed')
  }

  const keywords = Array.isArray(resp.data?.tagvalue)
    ? resp.data.tagvalue.map((item: any) => decodeHtml(item?.key))
    : []
  return uniqueStrings(keywords).slice(0, limit)
}

async function getTxHotSearch(limit: number): Promise<string[]> {
  const resp = await withRetry(() =>
    httpRequest('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      headers: {
        Referer: 'https://y.qq.com/portal/player.html',
      },
      body: {
        comm: {
          ct: '19',
          cv: '1803',
          guid: '0',
          patch: '118',
          tmeAppID: 'qqmusic',
          tmeLoginType: 0,
          uin: '0',
          wid: '0',
        },
        hotkey: {
          method: 'GetHotkeyForQQMusicPC',
          module: 'tencent_musicsoso_hotkey.HotkeyService',
          param: {
            search_id: '',
            uin: 0,
          },
        },
      },
    })
  )

  if (resp.data?.code !== 0) {
    throw new Error('TX hot search API failed')
  }

  const rawKeywords = Array.isArray(resp.data?.hotkey?.data?.vec_hotkey)
    ? resp.data.hotkey.data.vec_hotkey
    : []
  const keywords = rawKeywords.map((item: any) => decodeHtml(item?.query))
  return uniqueStrings(keywords).slice(0, limit)
}

async function getWyHotSearch(limit: number): Promise<string[]> {
  // 与 CeruMusic 对齐：优先取 /api/search/chart/detail（HOT_SEARCH_SONG#@#）。
  try {
    const chartResp = await withRetry(() =>
      wyRequest('https://music.163.com/api/search/chart/detail', {
        id: 'HOT_SEARCH_SONG#@#',
      })
    )
    if (chartResp.data?.code === 200) {
      const rawList = Array.isArray(chartResp.data?.data?.itemList)
        ? chartResp.data.data.itemList
        : []
      const keywords = rawList.map((item: any) =>
        decodeHtml(item?.searchWord || item?.word)
      )
      const unique = uniqueStrings(keywords)
      if (unique.length) return unique.slice(0, limit)
    }
  } catch {
    // fallback below
  }

  // 公开 detail 接口兜底。
  try {
    const detailResp = await withRetry(() =>
      httpRequest('https://music.163.com/api/search/hot/detail')
    )
    if (detailResp.data?.code === 200 && Array.isArray(detailResp.data?.data)) {
      const keywords = detailResp.data.data.map((item: any) =>
        decodeHtml(item?.searchWord || item?.word)
      )
      const unique = uniqueStrings(keywords)
      if (unique.length) return unique.slice(0, limit)
    }
  } catch {
    // fallback below
  }

  // 老接口兜底。
  const linuxResp = await withRetry(() =>
    wyRequest('https://music.163.com/api/search/hot', {})
  )
  if (linuxResp.data?.code !== 200) {
    throw new Error('WY hot search API failed')
  }

  const rawKeywords = Array.isArray(linuxResp.data?.result?.hots)
    ? linuxResp.data.result.hots
    : []
  const keywords = rawKeywords.map((item: any) => decodeHtml(item?.first || item?.searchWord))
  const unique = uniqueStrings(keywords)
  if (!unique.length) {
    throw new Error('WY hot search list is empty')
  }
  return unique.slice(0, limit)
}

async function getKgHotSearch(limit: number): Promise<string[]> {
  const resp = await withRetry(() =>
    httpRequest('http://gateway.kugou.com/api/v3/search/hot_tab', {
      query: {
        signature: 'ee44edb9d7155821412d220bcaf509dd',
        appid: 1005,
        clientver: 10026,
        plat: 0,
      },
      headers: {
        dfid: '1ssiv93oVqMp27cirf2CvoF1',
        mid: '156798703528610303473757548878786007104',
        clienttime: '1584257267',
        'x-router': 'msearch.kugou.com',
        'user-agent': 'Android9-AndroidPhone-10020-130-0-searchrecommendprotocol-wifi',
        'kg-rc': '1',
      },
    })
  )

  if (resp.data?.errcode !== 0) {
    throw new Error('KG hot search API failed')
  }

  const keywordGroups = Array.isArray(resp.data?.data?.list) ? resp.data.data.list : []
  const keywords: string[] = []
  for (const group of keywordGroups) {
    if (!Array.isArray(group?.keywords)) continue
    for (const item of group.keywords) {
      keywords.push(decodeHtml(item?.keyword))
    }
  }
  return uniqueStrings(keywords).slice(0, limit)
}

class MusicSearch {
  /**
   * 兼容旧接口：返回 SearchResult。
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const source = options.source || 'kw'
    const limit = options.limit ?? DEFAULT_LIMIT
    const page =
      options.page ??
      (options.offset !== undefined ? Math.floor(options.offset / limit) + 1 : 1)
    const result = await this.searchTracksBySource({
      query: options.query,
      source,
      page,
      limit,
    })
    return {
      tracks: result.list,
      playlists: [],
      artists: [],
    }
  }

  /**
   * 按指定平台搜索歌曲。
   */
  async searchTracksBySource(options: SearchTracksOptions): Promise<SearchTracksPageResult> {
    const query = options.query.trim()
    if (!query) {
      return {
        list: [],
        total: 0,
        page: options.page || 1,
        limit: options.limit || DEFAULT_LIMIT,
        hasMore: false,
        source: options.source,
      }
    }

    const page = Math.max(1, options.page || 1)
    const limit = Math.max(1, options.limit || DEFAULT_LIMIT)
    const handler = SEARCH_HANDLERS[options.source]
    if (!handler) {
      throw new Error(`Search source ${options.source} is not supported`)
    }

    return handler(query, page, limit)
  }

  /**
   * 兼容旧接口：默认使用 KW 搜索。
   */
  async searchTracks(query: string, limit = DEFAULT_LIMIT): Promise<Track[]> {
    const result = await this.searchTracksBySource({
      query,
      source: 'kw',
      page: 1,
      limit,
    })
    return result.list
  }

  /**
   * 获取指定平台热搜词。
   */
  async getHotSearch(source: DiscoverSourceId = 'kw', limit = 18): Promise<string[]> {
    const safeLimit = Math.max(1, limit)
    const handler = HOT_SEARCH_HANDLERS[source]
    if (!handler) return HOT_KEYWORDS_FALLBACK.slice(0, safeLimit)

    try {
      const list = await handler(safeLimit)
      if (!list.length) return HOT_KEYWORDS_FALLBACK.slice(0, safeLimit)
      return list
    } catch (error) {
      console.warn(`[Search] Load hot keywords failed for ${source}:`, error)
      return HOT_KEYWORDS_FALLBACK.slice(0, safeLimit)
    }
  }

  /**
   * 获取搜索建议。
   * 这里采用“热搜词 + 当前搜索结果标题”组合策略，避免额外网络接口依赖。
   */
  async getSuggestions(query: string, source: DiscoverSourceId = 'kw'): Promise<string[]> {
    const keyword = query.trim()
    if (!keyword) return []

    const [hotKeywords, searchResult] = await Promise.all([
      this.getHotSearch(source, 20),
      this.searchTracksBySource({
        query: keyword,
        source,
        page: 1,
        limit: 8,
      }).catch(() => ({
        list: [] as Track[],
        total: 0,
        page: 1,
        limit: 8,
        hasMore: false,
        source,
      })),
    ])

    const lowerKeyword = keyword.toLowerCase()
    const fromHot = hotKeywords.filter(item => item.toLowerCase().includes(lowerKeyword))
    const fromTracks = searchResult.list.map(item => item.title).filter(Boolean)

    return uniqueStrings([...fromHot, ...fromTracks]).slice(0, 10)
  }
}

export default new MusicSearch()
