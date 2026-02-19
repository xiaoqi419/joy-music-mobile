/**
 * WY（网易云音乐）数据源适配器。
 * 所有 API 请求通过 linuxapi 加密通道发送。
 */

import { Track } from '../../../types/music'
import {
  LeaderboardBoardList,
  LeaderboardDetail,
  SongListDetail,
  SongListPage,
  SongListTagInfo,
} from '../../../types/discover'
import { httpRequest, withRetry } from '../http'
import { wyRequest } from '../wyCrypto'
import { DiscoverSourceAdapter } from './types'

const SONG_LIMIT = 30
const DETAIL_LIMIT = 1000

const sortList = [{ id: 'hot', tid: 'hot', name: 'Hot' }]

const STATIC_TOP_LIST = [
  { id: 'wy__19723756', name: '飙升榜', bangId: '19723756' },
  { id: 'wy__3779629', name: '新歌榜', bangId: '3779629' },
  { id: 'wy__3778678', name: '热歌榜', bangId: '3778678' },
  { id: 'wy__2884035', name: '原创榜', bangId: '2884035' },
  { id: 'wy__71384707', name: '古典榜', bangId: '71384707' },
  { id: 'wy__2250011882', name: '抖音榜', bangId: '2250011882' },
  { id: 'wy__745956260', name: '韩语榜', bangId: '745956260' },
  { id: 'wy__1978921795', name: '电音榜', bangId: '1978921795' },
  { id: 'wy__2006508653', name: '电竞榜', bangId: '2006508653' },
  { id: 'wy__21845217', name: 'KTV唛榜', bangId: '21845217' },
]

const MIN_EXPECTED_WY_BOARD_COUNT = 10

/** 格式化播放量为中文可读字符串 */
const toPlayCount = (count: number | string | undefined): string => {
  const num = Number(count || 0)
  if (!Number.isFinite(num)) return '0'
  if (num > 100000000) return `${Math.round(num / 10000000) / 10}亿`
  if (num > 10000) return `${Math.round(num / 1000) / 10}万`
  return String(Math.round(num))
}

const ms = (value: number | undefined | null) => Math.max(0, Number(value || 0))

/** 将 WY 原始歌曲数据映射为 Track */
function mapTrack(item: any): Track {
  const songmid = String(item.id || '')
  const source = 'wy'
  const qualitys: Record<string, boolean> = {}
  if (item.hr) qualitys.flac24bit = true
  if (item.sq || item.h) qualitys.flac = true
  if (item.h) qualitys['320k'] = true
  if (item.l || item.m) qualitys['128k'] = true

  return {
    id: `${source}_${songmid}`,
    title: item.name || '',
    artist: Array.isArray(item.ar) ? item.ar.map((s: any) => s.name).join(' / ') : '',
    album: item.al?.name || '',
    duration: ms(item.dt),
    url: '',
    coverUrl: item.al?.picUrl,
    source,
    songmid,
    picUrl: item.al?.picUrl,
    // @ts-expect-error keep runtime metadata for URL resolver fallback
    _types: qualitys,
  }
}

/** 从 URL 或字符串中解析歌单 ID */
function parseListId(id: string): string {
  const match = /id=(\d+)/.exec(id)
  if (match) return match[1]
  if (/^\d+$/.test(id)) return id
  const match2 = /playlist\/(\d+)/.exec(id)
  if (match2) return match2[1]
  return id
}

/** 获取歌单标签分类 */
async function getTags(): Promise<{ tags: SongListTagInfo[]; hotTags: SongListTagInfo[] }> {
  const catalogue = await withRetry(() =>
    wyRequest('https://music.163.com/api/playlist/catalogue', {})
  )
  const hot = await withRetry(() =>
    wyRequest('https://music.163.com/api/playlist/hottags', {})
  )

  const tags: SongListTagInfo[] = []
  const sub = catalogue.data?.sub || []
  const categories = catalogue.data?.categories || {}
  for (const item of sub) {
    tags.push({
      id: String(item.name),
      name: String(item.name),
      parentId: String(item.category),
      parentName: String(categories[item.category] || ''),
      source: 'wy',
    })
  }

  const hotTags: SongListTagInfo[] = (hot.data?.tags || []).map((item: any) => ({
    id: String(item.playlistTag?.name || item.name),
    name: String(item.playlistTag?.name || item.name),
    source: 'wy',
  }))

  return { tags, hotTags }
}

/** 获取歌单列表（加密请求） */
async function getList(sortId: string, tagId: string, page: number): Promise<SongListPage> {
  const offset = (page - 1) * SONG_LIMIT
  const resp = await withRetry(() =>
    wyRequest('https://music.163.com/api/playlist/list', {
      order: 'hot',
      cat: tagId || '全部',
      limit: SONG_LIMIT,
      offset,
      total: true,
    })
  )

  const playlists = resp.data?.playlists || []
  const total = Number(resp.data?.total || playlists.length)
  return {
    list: playlists.map((item: any) => ({
      id: String(item.id),
      name: item.name || '',
      author: item.creator?.nickname || '',
      coverUrl: item.coverImgUrl || '',
      playCount: toPlayCount(item.playCount),
      description: item.description || '',
      total: Number(item.trackCount || 0),
      source: 'wy',
    })),
    total,
    page,
    limit: SONG_LIMIT,
    maxPage: Math.max(1, Math.ceil(total / SONG_LIMIT)),
    source: 'wy',
    sortId: sortId || 'hot',
    tagId: tagId || '',
  }
}

/** 获取歌单详情及歌曲列表（加密请求） */
async function getListDetail(id: string, page: number): Promise<SongListDetail> {
  const playlistId = parseListId(id)
  const resp = await withRetry(() =>
    wyRequest('https://music.163.com/api/v3/playlist/detail', {
      id: playlistId,
      n: DETAIL_LIMIT,
      s: 8,
    })
  )
  const playlist = resp.data?.playlist || {}
  const allTracks = (playlist.tracks || []).map((item: any) => mapTrack(item))
  const limit = DETAIL_LIMIT
  const start = (page - 1) * limit
  const list = allTracks.slice(start, start + limit)
  const total = Number(playlist.trackCount || allTracks.length)

  return {
    id: playlistId,
    source: 'wy',
    list,
    total,
    page,
    limit,
    maxPage: Math.max(1, Math.ceil(total / limit)),
    info: {
      name: playlist.name || '',
      coverUrl: playlist.coverImgUrl || '',
      description: playlist.description || '',
      author: playlist.creator?.nickname || '',
      playCount: toPlayCount(playlist.playCount),
    },
  }
}

/** 获取排行榜列表 */
function parseDynamicBoards(rawList: any[]): LeaderboardBoardList['list'] {
  const uniq = new Set<string>()
  const list: LeaderboardBoardList['list'] = []
  for (const item of rawList) {
    const bangId = String(item?.id || '').trim()
    const name = String(item?.name || '').trim()
    if (!bangId || !name || uniq.has(bangId)) continue

    uniq.add(bangId)
    const rawCover = String(item?.coverImgUrl || item?.coverUrl || '').trim()
    const rawUpdate = String(item?.updateFrequency || item?.frequency || '').trim()
    list.push({
      id: `wy__${bangId}`,
      name,
      bangId,
      coverUrl: rawCover || undefined,
      updateFrequency: rawUpdate || undefined,
      source: 'wy',
    })
  }
  return list
}

function getStaticBoards(): LeaderboardBoardList['list'] {
  return STATIC_TOP_LIST.map(item => ({ ...item, source: 'wy' as const }))
}

async function getBoards(): Promise<LeaderboardBoardList> {
  try {
    // 先尝试 weapi 动态榜单。
    let linuxList: LeaderboardBoardList['list'] = []
    try {
      const resp = await withRetry(() =>
        wyRequest('https://music.163.com/weapi/toplist', {})
      )
      if (resp.data?.code === 200) {
        linuxList = parseDynamicBoards(resp.data?.list || [])
      }
    } catch (error) {
      console.warn('[Discover][WY] weapi/toplist failed:', error)
    }

    // 若 weapi 返回数量异常（如仅 3 个），再走公开榜单接口兜底。
    let openApiList: LeaderboardBoardList['list'] = []
    if (linuxList.length < MIN_EXPECTED_WY_BOARD_COUNT) {
      try {
        const openResp = await withRetry(() =>
          httpRequest('https://music.163.com/api/toplist/detail')
        )
        openApiList = parseDynamicBoards(openResp.data?.list || [])
      } catch (error) {
        console.warn('[Discover][WY] api/toplist/detail failed:', error)
      }
    }

    const staticList = getStaticBoards()
    const bestList = [linuxList, openApiList, staticList].sort((a, b) => b.length - a.length)[0]

    if (!bestList.length) {
      throw new Error('WY leaderboard list is empty')
    }

    if (bestList === staticList) {
      console.warn('[Discover][WY] Dynamic leaderboard unavailable, fallback to static boards.')
    } else if (bestList.length < MIN_EXPECTED_WY_BOARD_COUNT) {
      console.warn('[Discover][WY] Dynamic leaderboard count is low:', bestList.length)
    }

    return {
      source: 'wy',
      list: bestList,
    }
  } catch (error) {
    // 动态接口失败时保留内置榜单，确保“排行榜”页面可访问。
    console.warn('[Discover][WY] Dynamic leaderboard failed, fallback to static list:', error)
    return {
      source: 'wy',
      list: getStaticBoards(),
    }
  }
}

/** 获取排行榜歌曲详情 */
async function getBoardList(boardId: string, page: number): Promise<LeaderboardDetail> {
  const id = boardId.replace(/^wy__/, '')
  const detail = await getListDetail(id, page)
  return {
    id: `wy__${id}`,
    source: 'wy',
    list: detail.list,
    total: detail.total,
    page,
    limit: detail.limit,
    maxPage: detail.maxPage,
  }
}

export const wyDiscoverSource: DiscoverSourceAdapter = {
  id: 'wy',
  name: 'Netease',
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
