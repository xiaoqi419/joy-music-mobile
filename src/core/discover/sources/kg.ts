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

const TOP_LIST = [
  { id: 'kg__8888', name: 'TOP500', bangId: '8888' },
  { id: 'kg__6666', name: 'Rising', bangId: '6666' },
  { id: 'kg__52144', name: '抖音Hot Songs', bangId: '52144' },
  { id: 'kg__23784', name: 'Network Hits', bangId: '23784' },
  { id: 'kg__24971', name: 'DJ Hot', bangId: '24971' },
]

const toPlayCount = (count: number | string | undefined): string => {
  const num = Number(count || 0)
  if (!Number.isFinite(num)) return '0'
  if (num > 100000000) return `${Math.round(num / 10000000) / 10}B`
  if (num > 10000) return `${Math.round(num / 1000) / 10}W`
  return String(Math.round(num))
}

const decodeName = (value: string): string =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')

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
  const songmid = String(item.audio_id || item.songmid || item.audio_info?.audio_id || '')

  return {
    id: `kg_${songmid || hash || item.songname || Math.random()}`,
    title: decodeName(String(item.songname || item.name || '')),
    artist: Array.isArray(item.authors)
      ? item.authors.map((a: any) => a.author_name).join(' / ')
      : decodeName(String(item.singername || item.author_name || '')),
    album: decodeName(String(item.remark || item.album_name || item.album_info?.album_name || '')),
    duration: Math.max(0, Number(item.duration || item.timelength || item.audio_info?.timelength || 0) * (Number(item.duration || 0) > 1000 ? 1 : 1000)),
    url: '',
    coverUrl: undefined,
    source: 'kg',
    songmid,
    hash,
    // @ts-expect-error keep runtime metadata compatible with URL resolver
    _types: qualitys,
  }
}

async function getTags(): Promise<{ tags: SongListTagInfo[]; hotTags: SongListTagInfo[] }> {
  const resp = await withRetry(() =>
    httpRequest('http://www2.kugou.kugou.com/yueku/v9/special/getSpecial', {
      query: { is_smarty: 1 },
    })
  )

  if (resp.data?.status !== 1) throw new Error('KG tags API failed')

  const hotTags: SongListTagInfo[] = Object.values(resp.data?.data?.hotTag || {}).map((tag: any) => ({
    id: String(tag.special_id),
    name: String(tag.special_name),
    source: 'kg',
  }))

  const tags: SongListTagInfo[] = []
  const groups = resp.data?.data?.tagids || {}
  for (const groupName of Object.keys(groups)) {
    for (const tag of groups[groupName]?.data || []) {
      tags.push({
        id: String(tag.id),
        name: String(tag.name),
        parentId: String(tag.parent_id || ''),
        parentName: String(tag.pname || groupName),
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
    playCount: toPlayCount(item.total_play_count || item.play_count),
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

  return {
    id: listId,
    source: 'kg',
    list: rawList.map((item: any) => mapKgTrack(item)),
    total,
    page,
    limit,
    maxPage: Math.max(1, Math.ceil(total / limit)),
    info: {
      name: String(resp.data?.data?.specialname || ''),
      coverUrl: resp.data?.data?.imgurl || '',
      description: String(resp.data?.data?.intro || ''),
      author: String(resp.data?.data?.nickname || ''),
      playCount: toPlayCount(resp.data?.data?.playcount),
    },
  }
}

async function getBoards(): Promise<LeaderboardBoardList> {
  return {
    source: 'kg',
    list: TOP_LIST.map(item => ({ ...item, source: 'kg' as const })),
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
