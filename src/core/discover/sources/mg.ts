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
const DETAIL_LIMIT = 30

const sortList = [{ id: '15127315', tid: 'recommend', name: 'Recommend' }]

const TOP_LIST = [
  { id: 'mg__27553319', name: 'New Songs', bangId: '27553319' },
  { id: 'mg__27186466', name: 'Hot Songs', bangId: '27186466' },
  { id: 'mg__27553408', name: 'Original', bangId: '27553408' },
  { id: 'mg__75959118', name: 'Music Trend', bangId: '75959118' },
  { id: 'mg__23189399', name: 'Mainland', bangId: '23189399' },
]

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1',
  Referer: 'https://m.music.migu.cn/',
}

const toPlayCount = (count: number | string | undefined): string => {
  const num = Number(count || 0)
  if (!Number.isFinite(num)) return '0'
  if (num > 100000000) return `${Math.round(num / 10000000) / 10}B`
  if (num > 10000) return `${Math.round(num / 1000) / 10}W`
  return String(Math.round(num))
}

function parseMgListId(input: string): string {
  const id = String(input || '')
  if (/\/playlist[/?]/.test(id)) {
    return /(?:playlistId|id)=(\d+)/.exec(id)?.[1] || id
  }
  const m = /\/playlist\/(\d+)/.exec(id)
  if (m) return m[1]
  return id
}

function qualityMap(item: any): Record<string, boolean> {
  const q: Record<string, boolean> = {}
  if (item?.audioFormatType?.includes?.('SQ')) q.flac = true
  if (item?.audioFormatType?.includes?.('HQ')) q['320k'] = true
  if (item?.audioFormatType?.includes?.('PQ')) q['128k'] = true
  return q
}

function mapTrack(item: any): Track {
  const songId = String(item.songId || item.id || '')
  const copyrightId = String(item.copyrightId || '')
  const songmid = songId || copyrightId

  return {
    id: `mg_${songmid}`,
    title: String(item.songName || item.name || ''),
    artist: String(item.singer || item.singerName || item.artists?.map?.((a: any) => a.name)?.join?.(' / ') || ''),
    album: String(item.album || item.albumName || ''),
    duration: Math.max(0, Number(item.length || item.duration || 0) * (Number(item.length || 0) > 1000 ? 1 : 1000)),
    url: '',
    coverUrl: item.mediumPic || item.cover || undefined,
    source: 'mg',
    songmid,
    copyrightId: copyrightId || undefined,
    picUrl: item.mediumPic || item.cover || undefined,
    // @ts-expect-error keep runtime metadata compatible with URL resolver
    _types: qualityMap(item),
  }
}

async function getTags(): Promise<{ tags: SongListTagInfo[]; hotTags: SongListTagInfo[] }> {
  const resp = await withRetry(() =>
    httpRequest('https://app.c.nf.migu.cn/pc/v1.0/template/musiclistplaza-taglist/release', {
      headers: DEFAULT_HEADERS,
    })
  )

  if (resp.data?.code !== '000000') throw new Error('MG tags API failed')

  const groups = resp.data?.data || []
  const hotTags: SongListTagInfo[] = (groups[0]?.content || []).map((item: any) => {
    const [name, id] = item.texts || []
    return {
      id: String(id || ''),
      name: String(name || ''),
      source: 'mg' as const,
    }
  })

  const tags: SongListTagInfo[] = []
  for (const group of groups.slice(1)) {
    for (const item of group.content || []) {
      const [name, id] = item.texts || []
      tags.push({
        id: String(id || ''),
        name: String(name || ''),
        parentName: String(group.header?.title || ''),
        source: 'mg',
      })
    }
  }

  return { tags, hotTags }
}

function flattenPlaylistItems(listData: any[], list: any[] = [], ids: Set<string> = new Set()): any[] {
  for (const item of listData || []) {
    if (Array.isArray(item.contents)) {
      flattenPlaylistItems(item.contents, list, ids)
    } else if (item.resType === '2021') {
      const id = String(item.resId || '')
      if (!id || ids.has(id)) continue
      ids.add(id)
      list.push({
        id,
        name: item.txt || '',
        coverUrl: item.img || undefined,
        description: item.txt2 || '',
        source: 'mg' as const,
      })
    }
  }
  return list
}

async function getList(sortId: string, tagId: string, page: number): Promise<SongListPage> {
  const url = tagId
    ? 'https://app.c.nf.migu.cn/pc/v1.0/template/musiclistplaza-listbytag/release'
    : 'https://app.c.nf.migu.cn/pc/bmw/page-data/playlist-square-recommend/v1.0'

  const query = tagId
    ? { pageNumber: page, templateVersion: 2, tagId }
    : { templateVersion: 2, pageNo: page }

  const resp = await withRetry(() =>
    httpRequest(url, { query, headers: DEFAULT_HEADERS })
  )

  if (resp.data?.code !== '000000') throw new Error('MG song list API failed')

  const raw = resp.data?.data
  const list = raw?.contents
    ? flattenPlaylistItems(raw.contents)
    : (raw?.contentItemList?.[1]?.itemList || []).map((item: any) => ({
      id: String(item.logEvent?.contentId || ''),
      name: String(item.title || ''),
      coverUrl: item.imageUrl || undefined,
      description: '',
      source: 'mg' as const,
    }))

  const normalized = list.map((item: any) => ({
    id: item.id,
    name: item.name,
    author: '',
    coverUrl: item.coverUrl,
    playCount: undefined,
    description: item.description,
    total: undefined,
    source: 'mg' as const,
  }))

  return {
    list: normalized,
    total: normalized.length,
    page,
    limit: SONG_LIMIT,
    maxPage: normalized.length < SONG_LIMIT ? page : page + 1,
    source: 'mg',
    sortId: sortId || '15127315',
    tagId: tagId || '',
  }
}

async function getListDetail(id: string, page: number): Promise<SongListDetail> {
  const playlistId = parseMgListId(id)

  const [songsResp, infoResp] = await Promise.all([
    withRetry(() =>
      httpRequest('https://app.c.nf.migu.cn/MIGUM3.0/resource/playlist/song/v2.0', {
        query: {
          pageNo: page,
          pageSize: DETAIL_LIMIT,
          playlistId,
        },
        headers: DEFAULT_HEADERS,
      })
    ),
    withRetry(() =>
      httpRequest('https://c.musicapp.migu.cn/MIGUM3.0/resource/playlist/v2.0', {
        query: { playlistId },
        headers: DEFAULT_HEADERS,
      })
    ),
  ])

  if (songsResp.data?.code !== '000000') throw new Error('MG song list detail API failed')

  const songList = songsResp.data?.data?.songList || []
  const total = Number(songsResp.data?.data?.totalCount || songList.length)

  return {
    id: playlistId,
    source: 'mg',
    list: songList.map((item: any) => mapTrack(item)),
    total,
    page,
    limit: DETAIL_LIMIT,
    maxPage: Math.max(1, Math.ceil(total / DETAIL_LIMIT)),
    info: {
      name: String(infoResp.data?.data?.title || ''),
      coverUrl: infoResp.data?.data?.imgItem?.img || '',
      description: String(infoResp.data?.data?.summary || ''),
      author: String(infoResp.data?.data?.ownerName || ''),
      playCount: toPlayCount(infoResp.data?.data?.opNumItem?.playNum),
    },
  }
}

async function getBoards(): Promise<LeaderboardBoardList> {
  return {
    source: 'mg',
    list: TOP_LIST.map(item => ({ ...item, source: 'mg' as const })),
  }
}

async function getBoardList(boardId: string, page: number): Promise<LeaderboardDetail> {
  const bangId = boardId.replace(/^mg__/, '')

  const resp = await withRetry(() =>
    httpRequest('https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/querycontentbyId.do', {
      query: { columnId: bangId, needAll: 0 },
      headers: {
        Referer: 'https://app.c.nf.migu.cn/',
        channel: '0146921',
      },
    })
  )

  if (resp.data?.code !== '000000') throw new Error('MG leaderboard API failed')

  const contents = resp.data?.columnInfo?.contents || []
  const tracks = contents.map((item: any) => mapTrack(item.objectInfo || item))

  return {
    id: `mg__${bangId}`,
    source: 'mg',
    list: tracks,
    total: tracks.length,
    page,
    limit: tracks.length || 1,
    maxPage: 1,
  }
}

export const mgDiscoverSource: DiscoverSourceAdapter = {
  id: 'mg',
  name: 'Migu',
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
