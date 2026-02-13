import {
  LeaderboardDetail,
  SongListDetail,
  SongListPage,
} from '../../types/discover'

const songListPageCache = new Map<string, SongListPage>()
const songListDetailCache = new Map<string, SongListDetail>()
const leaderboardDetailCache = new Map<string, LeaderboardDetail>()

const key = (...parts: Array<string | number>) => parts.join('__')

export function getSongListPageCache(
  source: string,
  sortId: string,
  tagId: string,
  page: number
): SongListPage | null {
  return songListPageCache.get(key('slist', source, sortId, tagId, page)) ?? null
}

export function setSongListPageCache(
  source: string,
  sortId: string,
  tagId: string,
  page: number,
  data: SongListPage
): void {
  songListPageCache.set(key('slist', source, sortId, tagId, page), data)
}

export function getSongListDetailCache(
  source: string,
  id: string,
  page: number
): SongListDetail | null {
  return songListDetailCache.get(key('sdetail', source, id, page)) ?? null
}

export function setSongListDetailCache(
  source: string,
  id: string,
  page: number,
  data: SongListDetail
): void {
  songListDetailCache.set(key('sdetail', source, id, page), data)
}

export function getLeaderboardDetailCache(
  source: string,
  boardId: string,
  page: number
): LeaderboardDetail | null {
  return leaderboardDetailCache.get(key('top', source, boardId, page)) ?? null
}

export function setLeaderboardDetailCache(
  source: string,
  boardId: string,
  page: number,
  data: LeaderboardDetail
): void {
  leaderboardDetailCache.set(key('top', source, boardId, page), data)
}

export function clearDiscoverCache(): void {
  songListPageCache.clear()
  songListDetailCache.clear()
  leaderboardDetailCache.clear()
}
