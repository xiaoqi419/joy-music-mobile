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

const SONG_LIMIT = 36
const DETAIL_LIMIT = 100
const TOP_LIMIT = 100

const sortList = [
  { id: 'new', tid: 'new', name: 'Newest' },
  { id: 'hot', tid: 'hot', name: 'Hot' },
]

const STATIC_BOARD_LIST = [
  { id: 'kw__93', name: '飙升榜', bangId: '93' },
  { id: 'kw__17', name: '新歌榜', bangId: '17' },
  { id: 'kw__16', name: '热歌榜', bangId: '16' },
  { id: 'kw__158', name: '抖音热歌榜', bangId: '158' },
  { id: 'kw__255', name: 'KTV点唱榜', bangId: '255' },
]

const toPlayCount = (count: number | string | undefined): string => {
  const num = Number(count || 0)
  if (!Number.isFinite(num)) return '0'
  if (num > 100000000) return `${Math.round(num / 10000000) / 10}亿`
  if (num > 10000) return `${Math.round(num / 1000) / 10}万`
  return String(Math.round(num))
}

const formatDuration = (seconds: number): number => {
  if (!Number.isFinite(seconds)) return 0
  return Math.max(0, Math.floor(seconds * 1000))
}

function parseQualityTypes(raw: string | undefined) {
  if (!raw) return {}
  const types: Record<string, boolean> = {}
  const regex = /bitrate:(\d+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(raw)) !== null) {
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

/** 将 KW 封面 URL 升级为高清（120px → 500px） */
const toHiResCover = (url: string | undefined): string | undefined => {
  if (!url) return undefined
  return url.replace('/albumcover/120/', '/albumcover/500/')
}

function mapTrack(item: any): Track {
  const songmid = String(item.id || item.rid || item.musicrid || '')
  const source = 'kw'
  const qualitys = parseQualityTypes(item.N_MINFO || item.minfo)
  const cover = toHiResCover(item.pic || item.img || item.albumpic)
  return {
    id: `${source}_${songmid}`,
    title: item.name || item.NAME || '',
    artist: item.artist || item.ARTIST || '',
    album: item.album || item.ALBUM || '',
    duration: formatDuration(Number(item.duration || item.DURATION || 0)),
    url: '',
    coverUrl: cover,
    source,
    songmid,
    picUrl: cover,
    hash: item.hash || undefined,
    // @ts-expect-error keep runtime metadata compatible with existing player URL flow
    _types: qualitys,
  }
}

function parseSongListId(id: string): string {
  if (id.startsWith('digest-') && id.includes('__')) return id.split('__')[1]
  return id
}

async function getSongListTags(): Promise<{ tags: SongListTagInfo[]; hotTags: SongListTagInfo[] }> {
  const tagsResp = await withRetry(() =>
    httpRequest('http://wapi.kuwo.cn/api/pc/classify/playlist/getTagList', {
      query: {
        cmd: 'rcm_keyword_playlist',
        user: 0,
        prod: 'kwplayer_pc_9.0.5.0',
        source: 'kwplayer_pc_9.0.5.0',
        loginUid: 0,
        loginSid: 0,
        appUid: 76039576,
      },
    })
  )
  const hotResp = await withRetry(() =>
    httpRequest('http://wapi.kuwo.cn/api/pc/classify/playlist/getRcmTagList', {
      query: { loginUid: 0, loginSid: 0, appUid: 76039576 },
    })
  )

  const tags: SongListTagInfo[] = []
  const rawTypes = tagsResp.data?.data || []
  for (const typeItem of rawTypes) {
    for (const item of typeItem.data || []) {
      tags.push({
        id: `${item.id}-${item.digest}`,
        name: item.name,
        parentId: String(typeItem.id),
        parentName: typeItem.name,
        source: 'kw',
      })
    }
  }

  const hotTags: SongListTagInfo[] = (hotResp.data?.data?.[0]?.data || []).map((item: any) => ({
    id: `${item.id}-${item.digest}`,
    name: item.name,
    source: 'kw',
  }))

  return { tags, hotTags }
}

async function getSongList(sortId: string, tagId: string, page: number): Promise<SongListPage> {
  let url = 'http://wapi.kuwo.cn/api/pc/classify/playlist/getRcmPlayList'
  let query: Record<string, string | number> = {
    loginUid: 0,
    loginSid: 0,
    appUid: 76039576,
    pn: page,
    rn: SONG_LIMIT,
    order: sortId || 'new',
  }

  if (tagId) {
    const [id, digest] = tagId.split('-')
    if (digest === '10000') {
      url = 'http://wapi.kuwo.cn/api/pc/classify/playlist/getTagPlayList'
      query = { ...query, id }
    }
  }

  const resp = await withRetry(() => httpRequest(url, { query }))
  const body = resp.data
  const data = body?.data?.data || []
  const total = Number(body?.data?.total || data.length)
  const limit = Number(body?.data?.rn || SONG_LIMIT)

  return {
    list: data.map((item: any) => ({
      id: `digest-${item.digest}__${item.id}`,
      name: item.name || '',
      author: item.uname || '',
      coverUrl: item.img || undefined,
      playCount: toPlayCount(item.listencnt),
      description: item.desc || '',
      total: Number(item.total || 0),
      source: 'kw',
    })),
    total,
    page,
    limit,
    maxPage: Math.max(1, Math.ceil(total / limit)),
    source: 'kw',
    sortId: sortId || 'new',
    tagId: tagId || '',
  }
}

async function getSongListDetail(id: string, page: number): Promise<SongListDetail> {
  const parsedId = parseSongListId(id)
  const resp = await withRetry(() =>
    httpRequest('http://nplserver.kuwo.cn/pl.svc', {
      query: {
        op: 'getlistinfo',
        pid: parsedId,
        pn: page - 1,
        rn: DETAIL_LIMIT,
        encode: 'utf8',
        keyset: 'pl2012',
        identity: 'kuwo',
        pcmp4: 1,
        vipver: 'MUSIC_9.0.5.0_W1',
        newver: 1,
      },
    })
  )
  const body = resp.data
  const playlistCover = body?.pic || ''
  const list = (body?.musiclist || []).map((item: any) => {
    const track = mapTrack(item)
    // KW 歌单详情 API 的 musiclist 不含歌曲封面，用歌单封面兜底
    if (!track.coverUrl && playlistCover) {
      track.coverUrl = playlistCover
      track.picUrl = playlistCover
    }
    return track
  })
  const total = Number(body?.total || list.length)
  const limit = Number(body?.rn || DETAIL_LIMIT)
  return {
    id: parsedId,
    source: 'kw',
    list,
    total,
    page,
    limit,
    maxPage: Math.max(1, Math.ceil(total / limit)),
    info: {
      name: body?.title || '',
      coverUrl: body?.pic || '',
      description: body?.info || '',
      author: body?.uname || '',
      playCount: toPlayCount(body?.playnum),
    },
  }
}

/**
 * 解析 KW 动态榜单列表。
 * 接口返回会包含 listen 字段，这里用于排序后再输出标准榜单结构。
 */
function parseDynamicBoards(rawList: any[]): LeaderboardBoardList['list'] {
  const parsed: Array<{
    id: string
    name: string
    bangId: string
    coverUrl?: string
    updateFrequency?: string
    source: 'kw'
    listen: number
  }> = []

  for (const item of rawList) {
    const bangId = String(item?.sourceid || item?.id || '').trim()
    const name = String(item?.name || '').trim()
    if (!bangId || !name) continue

    const rawCover = String(item?.pic || item?.img || '').trim()
    const rawUpdate = String(item?.info || item?.update_frequency || '').trim()
    parsed.push({
      id: `kw__${bangId}`,
      name,
      bangId,
      coverUrl: rawCover || undefined,
      updateFrequency: rawUpdate || undefined,
      source: 'kw',
      listen: Number(item?.listen || 0),
    })
  }

  parsed.sort((a, b) => b.listen - a.listen)
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
      httpRequest('http://qukudata.kuwo.cn/q.k', {
        query: {
          op: 'query',
          cont: 'tree',
          node: 2,
          pn: 0,
          rn: 1000,
          fmt: 'json',
          level: 3,
        },
      })
    )
    const dynamicList = parseDynamicBoards(resp.data?.child || [])
    if (!dynamicList.length) {
      throw new Error('KW dynamic leaderboard is empty')
    }
    return {
      source: 'kw',
      list: dynamicList,
    }
  } catch (error) {
    // 动态接口可能受风控或网络波动影响，失败时回退到内置榜单保证可用性。
    console.warn('[Discover][KW] Dynamic leaderboard failed, fallback to static list:', error)
    return {
      source: 'kw',
      list: STATIC_BOARD_LIST.map(item => ({ ...item, source: 'kw' as const })),
    }
  }
}

async function getBoardList(boardId: string, page: number): Promise<LeaderboardDetail> {
  const id = boardId.replace(/^kw__/, '')
  const resp = await withRetry(() =>
    httpRequest('http://kbangserver.kuwo.cn/ksong.s', {
      query: {
        from: 'pc',
        fmt: 'json',
        pn: page - 1,
        rn: TOP_LIMIT,
        type: 'bang',
        data: 'content',
        id,
        show_copyright_off: 0,
        pcmp4: 1,
        isbang: 1,
      },
    })
  )

  const body = resp.data
  const list = (body?.musiclist || body?.list || []).map((item: any) => mapTrack(item))
  const total = Number(body?.num || body?.total || list.length)
  const limit = Number(body?.rn || TOP_LIMIT)
  return {
    id: `kw__${id}`,
    source: 'kw',
    list,
    total,
    page,
    limit,
    maxPage: Math.max(1, Math.ceil(total / limit)),
  }
}

export const kwDiscoverSource: DiscoverSourceAdapter = {
  id: 'kw',
  name: 'Kuwo',
  songList: {
    sortList,
    getTags: getSongListTags,
    getList: getSongList,
    getListDetail: getSongListDetail,
  },
  leaderboard: {
    getBoards,
    getList: getBoardList,
  },
}
