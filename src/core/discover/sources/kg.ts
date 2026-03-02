import { Track } from '../../../types/music'
import {
  LeaderboardBoardList,
  LeaderboardDetail,
  SongListDetail,
  SongListPage,
  SongListTagInfo,
} from '../../../types/discover'
import { httpRequest, withRetry } from '../http'
import { DiscoverSourceAdapter } from './types'
import { normalizeImageUrl } from '../../../utils/url'

const SONG_LIMIT = 30
const TOP_LIMIT = 100

const sortList = [
  { id: '5', tid: 'recommend', name: 'Recommend' },
  { id: '6', tid: 'hot', name: 'Hot' },
  { id: '7', tid: 'new', name: 'New' },
  { id: '8', tid: 'rise', name: 'Rise' },
]
const KG_FALLBACK_HOT_TAGS: SongListTagInfo[] = [
  { id: 'dj', name: 'DJ', source: 'kg' },
  { id: 'hot', name: '热门', source: 'kg' },
  { id: 'acg', name: 'ACG', source: 'kg' },
  { id: 'classic', name: '经典', source: 'kg' },
]

const STATIC_TOP_LIST = [
  { id: 'kg__8888', name: 'TOP500', bangId: '8888' },
  { id: 'kg__6666', name: 'Rising', bangId: '6666' },
  { id: 'kg__52144', name: '抖音Hot Songs', bangId: '52144' },
  { id: 'kg__23784', name: 'Network Hits', bangId: '23784' },
  { id: 'kg__24971', name: 'DJ Hot', bangId: '24971' },
]
const KG_MOBILE_API_HOSTS = [
  'https://mobiles.kugou.com',
]

function trimDecimal(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return String(Math.round(value * 10) / 10).replace(/\.0$/, '')
}

function formatPlayCountNumber(value: number): string {
  const num = Number(value || 0)
  if (!Number.isFinite(num) || num < 0) return '0'
  if (num > 100000000) return `${trimDecimal(num / 100000000)}B`
  if (num > 10000) return `${trimDecimal(num / 10000)}W`
  return String(Math.round(num))
}

const toPlayCount = (count: number | string | undefined | null): string => {
  if (count === undefined || count === null) return ''

  if (typeof count === 'number') {
    return formatPlayCountNumber(count)
  }

  const raw = String(count).trim()
  if (!raw) return ''

  const lower = raw.toLowerCase()
  if (lower === 'undefined' || lower === 'null') return ''

  const normalized = raw.replace(/[,，\s]/g, '')
  const unitMatched = /^(\d+(?:\.\d+)?)([万亿wWbB])$/.exec(normalized)
  if (unitMatched) {
    const value = Number(unitMatched[1])
    if (!Number.isFinite(value)) return ''
    const unitRaw = unitMatched[2]
    if (unitRaw === '万' || unitRaw === '亿') return `${trimDecimal(value)}${unitRaw}`
    return `${trimDecimal(value)}${unitRaw.toUpperCase()}`
  }

  const num = Number(normalized)
  if (Number.isFinite(num)) {
    return formatPlayCountNumber(num)
  }

  return ''
}

const decodeName = (value: string): string =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')

function parseDurationMs(raw: any): number {
  const value = Number(raw || 0)
  if (!Number.isFinite(value) || value <= 0) return 0
  return value > 1000 ? Math.floor(value) : Math.floor(value * 1000)
}

function parseFilenameMeta(filenameRaw: unknown): { title: string; artist: string } {
  const filename = decodeName(String(filenameRaw || '')).trim()
  if (!filename) return { title: '', artist: '' }

  const chunks = filename.split(/\s*-\s*/)
  if (chunks.length >= 2) {
    const artist = chunks.shift() || ''
    const title = chunks.join(' - ')
    return { title: title.trim(), artist: artist.trim() }
  }

  return { title: filename, artist: '' }
}

function resolveKgCover(item: any): string | undefined {
  return normalizeImageUrl(
    item.img ||
      item.imgurl ||
      item.album_img ||
      item.trans_param?.union_cover ||
      '',
    500
  )
}

function parseKgListId(input: string): string {
  const id = String(input || '')
  if (id.startsWith('id_')) return id.slice(3)
  const m = /special\/single\/(\d+)/.exec(id)
  if (m) return m[1]
  const m2 = /(?:\?|&)specialid=(\d+)/.exec(id)
  if (m2) return m2[1]
  const m3 = /plist\/list\/(\d+)/.exec(id)
  if (m3) return m3[1]
  return id
}

async function requestKgMobileApi<T = any>(
  path: string,
  query: Record<string, string | number | boolean | null | undefined>
) {
  let lastError: unknown
  for (const host of KG_MOBILE_API_HOSTS) {
    try {
      return await withRetry(() => httpRequest<T>(`${host}${path}`, { query }))
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error(`KG mobile API failed: ${path}`)
}

function extractScriptJsonByName(html: string, varName: string): string | null {
  const marker = new RegExp(`var\\s+${varName}\\s*=\\s*`, 'i')
  const matched = marker.exec(html)
  if (!matched) return null

  let start = matched.index + matched[0].length
  while (start < html.length && /\s/.test(html[start])) start += 1
  const openChar = html[start]
  const closeChar = openChar === '[' ? ']' : openChar === '{' ? '}' : ''
  if (!closeChar) return null

  let depth = 0
  let inString = false
  let quoteChar = ''
  let escaped = false

  for (let index = start; index < html.length; index += 1) {
    const char = html[index]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === quoteChar) {
        inString = false
      }
      continue
    }

    if (char === '"' || char === '\'') {
      inString = true
      quoteChar = char
      continue
    }

    if (char === openChar) {
      depth += 1
      continue
    }

    if (char === closeChar) {
      depth -= 1
      if (depth === 0) {
        return html.slice(start, index + 1)
      }
    }
  }

  return null
}

function parseScriptJson<T>(html: string, varName: string): T | null {
  const text = extractScriptJsonByName(html, varName)
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

async function fetchKgPlaylistPage(page: number): Promise<{
  list: any[]
  total: number
  limit: number
}> {
  const resp = await withRetry(() =>
    httpRequest('https://m.kugou.com/plist/index', {
      query: {
        json: 'true',
        page,
      },
    })
  )
  const list = Array.isArray(resp.data?.plist?.list?.info) ? resp.data.plist.list.info : []
  const total = Number(resp.data?.plist?.list?.total || list.length)
  const limit = Number(resp.data?.plist?.pagesize || SONG_LIMIT)
  return {
    list,
    total,
    limit: limit > 0 ? limit : SONG_LIMIT,
  }
}

function mapKgTrack(item: any): Track {
  const qualitys: Record<string, boolean> = {}
  if (Number(item.filesize_high || 0) > 0 || Number(item.sqfilesize || 0) > 0) qualitys.flac24bit = true
  if (Number(item.sqfilesize || 0) > 0 || Number(item.filesize_flac || 0) > 0) qualitys.flac = true
  if (Number(item['320filesize'] || 0) > 0 || Number(item.filesize_320 || 0) > 0) qualitys['320k'] = true
  if (Number(item.filesize || 0) > 0) qualitys['128k'] = true

  const hash = item.hash || item.audio_info?.hash || undefined
  const songmid = String(
    item.audio_id || item.songmid || item.audio_info?.audio_id || item.songid || ''
  )
  const filenameMeta = parseFilenameMeta(item.filename)
  const fallbackTitle = filenameMeta.title || String(songmid || hash || '')
  const fallbackArtist = filenameMeta.artist
  const title = decodeName(
    String(item.songname || item.name || item.audio_name || fallbackTitle || '')
  )
  const artist = Array.isArray(item.authors)
    ? item.authors.map((a: any) => a.author_name).join(' / ')
    : decodeName(
      String(
        item.singername ||
          item.author_name ||
          item.audio_info?.author_name ||
          fallbackArtist ||
          ''
      )
    )
  const album = decodeName(
    String(item.remark || item.album_name || item.album_info?.album_name || '')
  )
  const duration = parseDurationMs(
    item.duration || item.timelength || item.audio_info?.timelength
  )

  return {
    id: `kg_${songmid || hash || item.songname || Math.random()}`,
    title,
    artist,
    album,
    duration,
    url: '',
    coverUrl: resolveKgCover(item),
    source: 'kg',
    songmid,
    hash,
    // @ts-expect-error keep runtime metadata compatible with URL resolver
    _types: qualitys,
  }
}

async function fetchPlaylistInfoFromHtml(
  listId: string
): Promise<{ name?: string; coverUrl?: string; description?: string }> {
  const resp = await withRetry(() =>
    httpRequest('https://m.kugou.com/plist/list', {
      query: { specialid: listId },
    })
  )
  const html = String(resp.data || '')
  const result: { name?: string; coverUrl?: string; description?: string } = {}

  const specialInfo = parseScriptJson<any>(
    html,
    'specialInfo'
  )
  if (specialInfo) {
    result.name = decodeName(String(specialInfo.name || ''))
    result.coverUrl = normalizeImageUrl(specialInfo.image || specialInfo.imgurl || '', 500)
    result.description = decodeName(String(specialInfo.intro || ''))
  }

  return result
}

async function getTags(): Promise<{ tags: SongListTagInfo[]; hotTags: SongListTagInfo[] }> {
  // m.kugou 的歌单广场未提供稳定标签接口，这里返回安全兜底标签，
  // 保证筛选 UI 可用且不会触发网络报错。
  return {
    tags: [],
    hotTags: KG_FALLBACK_HOT_TAGS,
  }
}

async function getList(sortId: string, tagId: string, page: number): Promise<SongListPage> {
  const { list: rawList, total, limit } = await fetchKgPlaylistPage(page)
  const list = rawList.map((item: any) => ({
    id: `id_${item.specialid}`,
    name: String(item.specialname || ''),
    author: String(item.username || item.nickname || ''),
    coverUrl: resolveKgCover(item),
    playCount:
      toPlayCount(item.play_count_text) ||
      toPlayCount(item.playcount) ||
      toPlayCount(item.collectcount) ||
      '0',
    description: String(item.intro || ''),
    total: Number(item.songcount || 0),
    source: 'kg' as const,
  }))

  return {
    list,
    total,
    page,
    limit,
    maxPage: Math.max(1, Math.ceil(total / limit)),
    source: 'kg',
    sortId: sortId || '5',
    tagId: tagId || '',
  }
}

async function getListDetail(id: string, page: number): Promise<SongListDetail> {
  const listId = parseKgListId(id)
  let htmlInfo: { name?: string; coverUrl?: string; description?: string } = {}
  try {
    htmlInfo = await fetchPlaylistInfoFromHtml(listId)
  } catch {
    htmlInfo = {}
  }

  try {
    const resp = await requestKgMobileApi('/api/v3/special/song', {
      version: 9108,
      specialid: listId,
      plat: 0,
      pagesize: TOP_LIMIT,
      page,
      area_code: 1,
    })

    if (resp.data?.errcode !== 0) throw new Error('KG song list detail API failed')

    const rawList = resp.data?.data?.info || []
    const total = Number(resp.data?.data?.total || rawList.length)
    const limit = Number(resp.data?.data?.pagesize || TOP_LIMIT)
    const remoteName = String(resp.data?.data?.specialname || '')
    const remoteCover = String(resp.data?.data?.imgurl || '')
    const remoteDesc = String(resp.data?.data?.intro || '')

    return {
      id: listId,
      source: 'kg',
      list: rawList.map((item: any) => mapKgTrack(item)),
      total,
      page,
      limit,
      maxPage: Math.max(1, Math.ceil(total / limit)),
      info: {
        name: remoteName || htmlInfo.name || '',
        coverUrl: normalizeImageUrl(remoteCover || htmlInfo.coverUrl || '', 500) || '',
        description: remoteDesc || htmlInfo.description || '',
        author: String(resp.data?.data?.nickname || ''),
        playCount: toPlayCount(resp.data?.data?.playcount) || '0',
      },
    }
  } catch (mobileError) {
    const detailResp = await withRetry(() =>
      httpRequest('https://m.kugou.com/plist/list', {
        query: { specialid: listId },
      })
    )
    const html = String(detailResp.data || '')
    const embeddedList = parseScriptJson<any[]>(html, 'data') || []
    const specialInfo = parseScriptJson<any>(html, 'specialInfo') || {}
    if (!embeddedList.length) throw mobileError

    const allTracks = embeddedList.map((item) => mapKgTrack(item))
    const limit = TOP_LIMIT
    const total = allTracks.length
    const start = Math.max(0, (page - 1) * limit)
    const list = allTracks.slice(start, start + limit)
    return {
      id: listId,
      source: 'kg',
      list,
      total,
      page,
      limit,
      maxPage: Math.max(1, Math.ceil(total / limit)),
      info: {
        name: decodeName(String(specialInfo.name || htmlInfo.name || '')),
        coverUrl:
          normalizeImageUrl(
            specialInfo.image || specialInfo.imgurl || htmlInfo.coverUrl || '',
            500
          ) || '',
        description: decodeName(String(specialInfo.intro || htmlInfo.description || '')),
        author: decodeName(String(specialInfo.nickname || '')),
        playCount: toPlayCount(specialInfo.playcount) || toPlayCount(specialInfo.play_count) || '',
      },
    }
  }
}

function parseDynamicBoards(rawList: any[]): LeaderboardBoardList['list'] {
  const parsed: Array<{
    id: string
    name: string
    bangId: string
    coverUrl?: string
    updateFrequency?: string
    source: 'kg'
    playTimes: number
  }> = []

  for (const item of rawList) {
    // 与 CeruMusic 保持一致：仅保留可出歌的榜单（isvol = 1）。
    if (item?.isvol !== undefined && Number(item.isvol) !== 1) continue

    const bangId = String(item?.rankid || item?.id || '').trim()
    const name = String(item?.rankname || item?.name || '').trim()
    if (!bangId || !name) continue

    const rawCover = String(item?.imgurl || item?.img || '').trim()
    const rawUpdate = String(item?.update_frequency || item?.updateFrequency || '').trim()
    parsed.push({
      id: `kg__${bangId}`,
      name,
      bangId,
      coverUrl: normalizeImageUrl(rawCover, 500),
      updateFrequency: rawUpdate || undefined,
      source: 'kg',
      playTimes: Number(item?.play_times || 0),
    })
  }

  parsed.sort((a, b) => b.playTimes - a.playTimes)
  const uniq = new Set<string>()
  const list: LeaderboardBoardList['list'] = []
  for (const item of parsed) {
    if (uniq.has(item.bangId)) continue
    uniq.add(item.bangId)
    list.push({
      id: item.id,
      name: item.name,
      bangId: item.bangId,
      coverUrl: item.coverUrl,
      updateFrequency: item.updateFrequency,
      source: item.source,
    })
  }
  return list
}

async function getBoards(): Promise<LeaderboardBoardList> {
  try {
    const resp = await requestKgMobileApi('/api/v5/rank/list', {
      version: 9108,
      plat: 0,
      showtype: 2,
      parentid: 0,
      apiver: 6,
      area_code: 1,
      withsong: 1,
    })
    if (resp.data?.errcode !== 0) {
      throw new Error('KG dynamic leaderboard API failed')
    }

    const dynamicList = parseDynamicBoards(resp.data?.data?.info || [])
    if (!dynamicList.length) {
      throw new Error('KG dynamic leaderboard is empty')
    }

    return {
      source: 'kg',
      list: dynamicList,
    }
  } catch (error) {
    // 网络抖动或接口受限时回退静态榜单，避免页面空白。
    console.warn('[Discover][KG] Dynamic leaderboard failed, fallback to static list:', error)
    return {
      source: 'kg',
      list: STATIC_TOP_LIST.map(item => ({ ...item, source: 'kg' as const })),
    }
  }
}

async function getBoardList(boardId: string, page: number): Promise<LeaderboardDetail> {
  const bangId = boardId.replace(/^kg__/, '')
  const resp = await requestKgMobileApi('/api/v3/rank/song', {
    version: 9108,
    ranktype: 1,
    plat: 0,
    pagesize: TOP_LIMIT,
    area_code: 1,
    page,
    rankid: bangId,
    with_res_tag: 0,
  })

  if (resp.data?.errcode !== 0) throw new Error('KG leaderboard API failed')

  const rawList = resp.data?.data?.info || []
  const total = Number(resp.data?.data?.total || rawList.length)
  const limit = Number(resp.data?.data?.pagesize || TOP_LIMIT)

  return {
    id: `kg__${bangId}`,
    source: 'kg',
    list: rawList.map((item: any) => mapKgTrack(item)),
    total,
    page,
    limit,
    maxPage: Math.max(1, Math.ceil(total / limit)),
  }
}

export const kgDiscoverSource: DiscoverSourceAdapter = {
  id: 'kg',
  name: 'Kugou',
  songList: {
    sortList,
    getTags,
    getList,
    getListDetail,
  },
  leaderboard: {
    getBoards,
    getList: getBoardList,
  },
}
