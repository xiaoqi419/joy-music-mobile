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
const TOP_LIMIT = 200

const sortList = [
  { id: 'hot', tid: 'hot', name: 'Hot' },
  { id: 'new', tid: 'new', name: 'New' },
]

const TOP_LIST = [
  { id: 'tx__4', name: 'Pop Index', bangId: '4' },
  { id: 'tx__26', name: 'Hot Songs', bangId: '26' },
  { id: 'tx__27', name: 'New Songs', bangId: '27' },
  { id: 'tx__62', name: 'Rising', bangId: '62' },
  { id: 'tx__60', name: 'Douyin', bangId: '60' },
]

const toPlayCount = (count: number | string | undefined): string => {
  const num = Number(count || 0)
  if (!Number.isFinite(num)) return '0'
  if (num > 100000000) return `${Math.round(num / 10000000) / 10}B`
  if (num > 10000) return `${Math.round(num / 1000) / 10}W`
  return String(Math.round(num))
}

const unescapeHtml = (value: string): string =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')

function parseTxListId(input: string): string {
  const id = String(input || '')
  const m1 = /\/playlist\/(\d+)/.exec(id)
  if (m1) return m1[1]
  const m2 = /(?:\?|&)id=(\d+)/.exec(id)
  if (m2) return m2[1]
  return id
}

function mapTrack(item: any): Track {
  const songmid = String(item.mid || item.songmid || item.id || '')
  const albumMid = String(item.album?.mid || '')
  const picByAlbum = albumMid
    ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumMid}.jpg`
    : ''
  const singerMid = item.singer?.[0]?.mid
  const picBySinger = singerMid
    ? `https://y.gtimg.cn/music/photo_new/T001R500x500M000${singerMid}.jpg`
    : ''

  const file = item.file || {}
  const qualitys: Record<string, boolean> = {}
  if (Number(file.size_hires || 0) > 0) qualitys.flac24bit = true
  if (Number(file.size_flac || 0) > 0) qualitys.flac = true
  if (Number(file.size_320mp3 || 0) > 0) qualitys['320k'] = true
  if (Number(file.size_128mp3 || 0) > 0) qualitys['128k'] = true

  return {
    id: `tx_${songmid}`,
    title: item.title || item.name || '',
    artist: Array.isArray(item.singer)
      ? item.singer.map((s: any) => s.name).join(' / ')
      : '',
    album: item.album?.name || '',
    duration: Math.max(0, Number(item.interval || 0) * 1000),
    url: '',
    coverUrl: picByAlbum || picBySinger || undefined,
    source: 'tx',
    songmid,
    picUrl: picByAlbum || picBySinger || undefined,
    // @ts-expect-error keep runtime metadata compatible with URL resolver
    _types: qualitys,
  }
}

async function getTags(): Promise<{ tags: SongListTagInfo[]; hotTags: SongListTagInfo[] }> {
  const tagsResp = await withRetry(() =>
    httpRequest('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      query: {
        loginUin: 0,
        hostUin: 0,
        format: 'json',
        inCharset: 'utf-8',
        outCharset: 'utf-8',
        notice: 0,
        platform: 'wk_v15.json',
        needNewCode: 0,
        data: JSON.stringify({
          tags: {
            method: 'get_all_categories',
            param: { qq: '' },
            module: 'playlist.PlaylistAllCategoriesServer',
          },
        }),
      },
    })
  )

  const hotResp = await withRetry(() =>
    httpRequest('https://c.y.qq.com/node/pc/wk_v15/category_playlist.html')
  )

  const tags: SongListTagInfo[] = []
  const groups = tagsResp.data?.tags?.data?.v_group || []
  for (const group of groups) {
    for (const item of group.v_item || []) {
      tags.push({
        id: String(item.id),
        name: String(item.name),
        parentId: String(group.group_id),
        parentName: String(group.group_name || ''),
        source: 'tx',
      })
    }
  }

  const hotTags: SongListTagInfo[] = []
  const html = String(hotResp.data || '')
  const re = /class="c_bg_link js_tag_item"\s+data-id="(\w+)">([^<]+)<\/a>/g
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    hotTags.push({
      id: String(match[1]),
      name: unescapeHtml(String(match[2])),
      source: 'tx',
    })
  }

  return { tags, hotTags }
}

async function getList(sortId: string, tagId: string, page: number): Promise<SongListPage> {
  const payload = tagId
    ? {
      comm: { cv: 1602, ct: 20 },
      playlist: {
        method: 'get_category_content',
        param: {
          titleid: Number(tagId),
          caller: '0',
          category_id: Number(tagId),
          size: SONG_LIMIT,
          page: page - 1,
          use_page: 1,
        },
        module: 'playlist.PlayListCategoryServer',
      },
    }
    : {
      comm: { cv: 1602, ct: 20 },
      playlist: {
        method: 'get_playlist_by_tag',
        param: {
          id: 10000000,
          sin: SONG_LIMIT * (page - 1),
          size: SONG_LIMIT,
          order: sortId || 'hot',
          cur_page: page,
        },
        module: 'playlist.PlayListPlazaServer',
      },
    }

  const resp = await withRetry(() =>
    httpRequest('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      query: {
        loginUin: 0,
        hostUin: 0,
        format: 'json',
        inCharset: 'utf-8',
        outCharset: 'utf-8',
        notice: 0,
        platform: 'wk_v15.json',
        needNewCode: 0,
        data: JSON.stringify(payload),
      },
    })
  )

  if (resp.data?.code !== 0) throw new Error('TX song list API failed')

  const data = resp.data?.playlist?.data || {}
  const listRaw = tagId ? data?.content?.v_item || [] : data?.v_playlist || []
  const list = listRaw.map((item: any) => {
    const basic = tagId ? item.basic || {} : item
    const id = basic.tid
    const play = tagId ? basic.play_cnt : basic.access_num
    const cover = tagId
      ? basic.cover?.medium_url || basic.cover?.default_url
      : basic.cover_url_medium

    return {
      id: String(id || ''),
      name: String(basic.title || ''),
      author: String((tagId ? basic.creator?.nick : basic.creator_info?.nick) || ''),
      coverUrl: cover || undefined,
      playCount: toPlayCount(play),
      description: unescapeHtml(String(basic.desc || '')).replace(/<br>/g, '\n'),
      total: Number(basic.song_ids?.length || 0),
      source: 'tx' as const,
    }
  })

  const total = Number(tagId ? data?.content?.total_cnt : data?.total || list.length)
  const limit = SONG_LIMIT

  return {
    list,
    total,
    page,
    limit,
    maxPage: Math.max(1, Math.ceil(total / limit)),
    source: 'tx',
    sortId: sortId || 'hot',
    tagId: tagId || '',
  }
}

async function getListDetail(id: string, page: number): Promise<SongListDetail> {
  const listId = parseTxListId(id)
  const resp = await withRetry(() =>
    httpRequest('https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg', {
      query: {
        type: 1,
        json: 1,
        utf8: 1,
        onlysong: 0,
        new_format: 1,
        disstid: listId,
        loginUin: 0,
        hostUin: 0,
        format: 'json',
        inCharset: 'utf8',
        outCharset: 'utf-8',
        notice: 0,
        platform: 'yqq.json',
        needNewCode: 0,
      },
      headers: {
        Origin: 'https://y.qq.com',
        Referer: `https://y.qq.com/n/ryqq/playlist/${listId}`,
      },
    })
  )

  if (resp.data?.code !== 0) throw new Error('TX song list detail API failed')

  const cd = resp.data?.cdlist?.[0]
  const allTracks = (cd?.songlist || []).map((item: any) => mapTrack(item))
  const limit = Math.max(allTracks.length, 1)
  const currentPage = 1

  return {
    id: listId,
    source: 'tx',
    list: allTracks,
    total: allTracks.length,
    page: currentPage,
    limit,
    maxPage: 1,
    info: {
      name: String(cd?.dissname || ''),
      coverUrl: cd?.logo || '',
      description: unescapeHtml(String(cd?.desc || '')).replace(/<br>/g, '\n'),
      author: String(cd?.nickname || ''),
      playCount: toPlayCount(cd?.visitnum),
    },
  }
}

async function getBoards(): Promise<LeaderboardBoardList> {
  return {
    source: 'tx',
    list: TOP_LIST.map(item => ({ ...item, source: 'tx' as const })),
  }
}

async function getBoardPeriod(topId: string): Promise<string | undefined> {
  const resp = await withRetry(() =>
    httpRequest('https://c.y.qq.com/node/pc/wk_v15/top.html')
  )

  const html = String(resp.data || '')
  const re = new RegExp(
    `data-listname=".+?"\\s+data-tid=".+?\\/${topId}"\\s+data-date="(.+?)"`,
    'i'
  )
  const m = re.exec(html)
  return m?.[1]
}

async function getBoardList(boardId: string, page: number): Promise<LeaderboardDetail> {
  const topId = boardId.replace(/^tx__/, '')
  const period = await getBoardPeriod(topId)

  const resp = await withRetry(() =>
    httpRequest('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      body: {
        toplist: {
          module: 'musicToplist.ToplistInfoServer',
          method: 'GetDetail',
          param: {
            topid: Number(topId),
            num: TOP_LIMIT,
            period,
          },
        },
        comm: {
          uin: 0,
          format: 'json',
          ct: 20,
          cv: 1859,
        },
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)',
      },
    })
  )

  if (resp.data?.code !== 0) throw new Error('TX leaderboard API failed')

  const songInfoList = resp.data?.toplist?.data?.songInfoList || []
  const allTracks = songInfoList.map((item: any) => mapTrack(item))
  const limit = TOP_LIMIT
  const total = allTracks.length

  return {
    id: `tx__${topId}`,
    source: 'tx',
    list: allTracks,
    total,
    page,
    limit,
    maxPage: Math.max(1, Math.ceil(total / limit)),
  }
}

export const txDiscoverSource: DiscoverSourceAdapter = {
  id: 'tx',
  name: 'QQ Music',
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
