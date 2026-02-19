import { Track } from '../../types/music'
import {
  DiscoverSourceId,
  LeaderboardBoardItem,
  LeaderboardDetail,
  SongListDetail,
  SongListPage,
  SongListSortInfo,
  SongListTagInfo,
} from '../../types/discover'
import {
  getFallbackLeaderboardDetailCache,
  getFallbackSongListDetailCache,
  getFallbackSongListPageCache,
  getLeaderboardDetailCache,
  getSongListDetailCache,
  getSongListPageCache,
  setLeaderboardDetailCache,
  setSongListDetailCache,
  setSongListPageCache,
} from './cache'
import { discoverSources, discoverSourceList } from './sources'
import {
  DEFAULT_LEADERBOARD_SETTING,
  DEFAULT_SONGLIST_SETTING,
  getLeaderboardSetting,
  getSongListSetting,
  saveLeaderboardSetting,
  saveSongListSetting,
} from './settings'

export { discoverSourceList }
export {
  DEFAULT_LEADERBOARD_SETTING,
  DEFAULT_SONGLIST_SETTING,
  getSongListSetting,
  saveSongListSetting,
  getLeaderboardSetting,
  saveLeaderboardSetting,
}

function adapter(source: DiscoverSourceId) {
  return discoverSources[source as keyof typeof discoverSources] ?? discoverSources.kw
}

export async function getSongListTags(source: DiscoverSourceId): Promise<{
  tags: SongListTagInfo[]
  hotTags: SongListTagInfo[]
}> {
  return adapter(source).songList.getTags()
}

export function getSongListSortList(source: DiscoverSourceId): SongListSortInfo[] {
  return adapter(source).songList.sortList || []
}

export async function getSongListPage(params: {
  source: DiscoverSourceId
  sortId: string
  tagId: string
  page: number
  refresh?: boolean
}): Promise<SongListPage> {
  const { source, sortId, tagId, page, refresh = false } = params
  if (!refresh) {
    const cached = getSongListPageCache(source, sortId, tagId, page)
    if (cached) return cached
  }
  try {
    const result = await adapter(source).songList.getList(sortId, tagId, page)
    setSongListPageCache(source, sortId, tagId, page, result)
    return result
  } catch (error) {
    const fallback = getFallbackSongListPageCache(source)
    if (fallback) return fallback
    throw error
  }
}

export async function getSongListDetail(params: {
  source: DiscoverSourceId
  id: string
  page: number
  refresh?: boolean
}): Promise<SongListDetail> {
  const { source, id, page, refresh = false } = params
  if (!refresh) {
    const cached = getSongListDetailCache(source, id, page)
    if (cached) return cached
  }
  try {
    const result = await adapter(source).songList.getListDetail(id, page)
    setSongListDetailCache(source, id, page, result)
    return result
  } catch (error) {
    const fallback = getFallbackSongListDetailCache(source)
    if (fallback) return fallback
    throw error
  }
}

export async function getLeaderboardBoards(
  source: DiscoverSourceId
): Promise<LeaderboardBoardItem[]> {
  const result = await adapter(source).leaderboard.getBoards()
  return result.list
}

export async function getLeaderboardDetail(params: {
  source: DiscoverSourceId
  boardId: string
  page: number
  refresh?: boolean
}): Promise<LeaderboardDetail> {
  const { source, boardId, page, refresh = false } = params
  if (!refresh) {
    const cached = getLeaderboardDetailCache(source, boardId, page)
    if (cached) return cached
  }
  try {
    const result = await adapter(source).leaderboard.getList(boardId, page)
    setLeaderboardDetailCache(source, boardId, page, result)
    return result
  } catch (error) {
    const fallback = getFallbackLeaderboardDetailCache(source)
    if (fallback) return fallback
    throw error
  }
}

export async function getHotTracksFromTop(
  source: DiscoverSourceId
): Promise<Track[]> {
  const boards = await getLeaderboardBoards(source)
  if (!boards.length) return []
  const targets = boards.slice(0, 3)
  for (const board of targets) {
    try {
      const detail = await getLeaderboardDetail({
        source,
        boardId: board.id,
        page: 1,
      })
      if (detail.list.length) return detail.list.slice(0, 5)
    } catch {
      // try next board for better resilience
    }
  }
  const fallback = getFallbackLeaderboardDetailCache(source)
  return fallback?.list.slice(0, 5) ?? []
}
