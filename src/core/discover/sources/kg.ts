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

const SONG_LIMIT = 30
const TOP_LIMIT = 100

const sortList = [
  { id: '5', tid: 'recommend', name: 'Recommend' },
  { id: '6', tid: 'hot', name: 'Hot' },
  { id: '7', tid: 'new', name: 'New' },
  { id: '8', tid: 'rise', name: 'Rise' },
]

const STATIC_TOP_LIST = [
  { id: 'kg__8888', name: 'TOP500', bangId: '8888' },
  { id: 'kg__6666', name: 'Rising', bangId: '6666' },
  { id: 'kg__52144', name: '抖音Hot Songs', bangId: '52144' },
  { id: 'kg__23784', name: 'Network Hits', bangId: '23784' },
  { id: 'kg__24971', name: 'DJ Hot', bangId: '24971' },
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

function normalizeTagField(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const lower = text.toLowerCase()
  if (lower === 'undefined' || lower === 'null') return ''
  return text
}

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
  const raw = String(
    item.img ||
      item.imgurl ||
      item.album_img ||
      item.trans_param?.union_cover ||
      ''
  ).trim()
  if (!raw) return undefined
  return raw.includes('{size}') ? raw.replace('{size}', '500') : raw
}

function parseKgListId(input: string): string {
  const id = String(input || '')
  if (id.startsWith('id_')) return id.slice(3)
  const m = /special\/single\/(\d+)/.exec(id)
  if (m) return m[1]
  return id
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
    httpRequest(`http://www2.kugou.kugou.com/yueku/v9/special/single/${listId}-5-9999.html`)
  )
  const html = String(resp.data || '')
  const result: { name?: string; coverUrl?: string; description?: string } = {}

  const infoMatch = /global = \{[\s\S]+?name: "([^"]+)"[\s\S]+?pic: "([^"]+)"[\s\S]+?\};/.exec(html)
  if (infoMatch) {
    result.name = decodeName(infoMatch[1])
    result.coverUrl = infoMatch[2]
  }

  const descPrefix = '<div class="pc_specail_text pc_singer_tab_content" id="specailIntroduceWrap">'
  const descStart = html.indexOf(descPrefix)
  if (descStart >= 0) {
    const after = html.slice(descStart + descPrefix.length)
    const descEnd = after.indexOf('</div>')
    if (descEnd > 0) {
      result.description = decodeName(after.slice(0, descEnd).trim())
    }
  }

  return result
}

async function getTags(): Promise<{ tags: SongListTagInfo[]; hotTags: SongListTagInfo[] }> {
  const resp = await withRetry(() =>
    httpRequest('http://www2.kugou.kugou.com/yueku/v9/special/getSpecial', {
      query: { is_smarty: 1 },
    })
  )

  if (resp.data?.status !== 1) throw new Error('KG tags API failed')

  const hotTags: SongListTagInfo[] = []
  for (const tag of Object.values(resp.data?.data?.hotTag || {})) {
    const id = normalizeTagField((tag as any)?.special_id)
    const name = normalizeTagField((tag as any)?.special_name)
    if (!id || !name) continue
    hotTags.push({
      id,
      name,
      source: 'kg',
    })
  }

  const tags: SongListTagInfo[] = []
  const groups = resp.data?.data?.tagids || {}
  for (const groupName of Object.keys(groups)) {
    for (const tag of groups[groupName]?.data || []) {
      const id = normalizeTagField(tag.id)
      const name = normalizeTagField(tag.name)
      if (!id || !name) continue
      tags.push({
        id,
        name,
        parentId: normalizeTagField(tag.parent_id),
        parentName: normalizeTagField(tag.pname || groupName),
        source: 'kg',
      })
    }
  }

  return { tags, hotTags }
}

async function getList(sortId: string, tagId: string, page: number): Promise<SongListPage> {
  const resp = await withRetry(() =>
    httpRequest('http://www2.kugou.kugou.com/yueku/v9/special/getSpecial', {
      query: {
        is_ajax: 1,
        cdn: 'cdn',
        t: sortId || '5',
        c: tagId || '',
        p: page,
      },
    })
  )

  if (resp.data?.status !== 1) throw new Error('KG song list API failed')

  const list = (resp.data?.special_db || []).map((item: any) => ({
    id: `id_${item.specialid}`,
    name: String(item.specialname || ''),
    author: String(item.nickname || ''),
    coverUrl: item.img || item.imgurl || undefined,
    playCount: toPlayCount(item.total_play_count) || toPlayCount(item.play_count) || '0',
    description: String(item.intro || ''),
    total: Number(item.songcount || 0),
    source: 'kg' as const,
  }))

  const infoResp = await withRetry(() =>
    httpRequest('http://www2.kugou.kugou.com/yueku/v9/special/getSpecial', {
      query: {
        is_smarty: 1,
        cdn: 'cdn',
        t: 5,
        c: tagId || '',
      },
    })
  )

  const total = Number(infoResp.data?.data?.params?.total || list.length)
  const limit = Number(infoResp.data?.data?.params?.pagesize || SONG_LIMIT)

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

  const resp = await withRetry(() =>
    httpRequest('http://mobilecdnbj.kugou.com/api/v3/special/song', {
      query: {
        version: 9108,
        specialid: listId,
        plat: 0,
        pagesize: TOP_LIMIT,
        page,
        area_code: 1,
      },
    })
  )

  if (resp.data?.errcode !== 0) throw new Error('KG song list detail API failed')

  const rawList = resp.data?.data?.info || []
  const total = Number(resp.data?.data?.total || rawList.length)
  const limit = Number(resp.data?.data?.pagesize || TOP_LIMIT)
  let htmlInfo: { name?: string; coverUrl?: string; description?: string } = {}
  const remoteName = String(resp.data?.data?.specialname || '')
  const remoteCover = String(resp.data?.data?.imgurl || '')
  const remoteDesc = String(resp.data?.data?.intro || '')
  if (!remoteName || !remoteCover || !remoteDesc) {
    try {
      htmlInfo = await fetchPlaylistInfoFromHtml(listId)
    } catch {
      htmlInfo = {}
    }
  }

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
      coverUrl: remoteCover || htmlInfo.coverUrl || '',
      description: remoteDesc || htmlInfo.description || '',
      author: String(resp.data?.data?.nickname || ''),
      playCount: toPlayCount(resp.data?.data?.playcount) || '0',
    },
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
      coverUrl: rawCover ? rawCover.replace('{size}', '500') : undefined,
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
    const resp = await withRetry(() =>
      httpRequest('http://mobilecdnbj.kugou.com/api/v5/rank/list', {
        query: {
          version: 9108,
          plat: 0,
          showtype: 2,
          parentid: 0,
          apiver: 6,
          area_code: 1,
          withsong: 1,
        },
      })
    )
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
  const resp = await withRetry(() =>
    httpRequest('http://mobilecdnbj.kugou.com/api/v3/rank/song', {
      query: {
        version: 9108,
        ranktype: 1,
        plat: 0,
        pagesize: TOP_LIMIT,
        area_code: 1,
        page,
        rankid: bangId,
        with_res_tag: 0,
      },
    })
  )

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
