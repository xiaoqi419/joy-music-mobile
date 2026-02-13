import { Track } from './music'

export type DiscoverSourceId = 'kw' | 'wy' | 'tx' | 'kg' | 'mg'

export type DiscoverListState = 'idle' | 'loading' | 'error' | 'end'

export interface SongListSortInfo {
  id: string
  tid: string
  name: string
}

export interface SongListTagInfo {
  id: string
  name: string
  parentId?: string
  parentName?: string
  source: DiscoverSourceId
}

export interface SongListItem {
  id: string
  name: string
  author: string
  coverUrl?: string
  playCount?: string
  description?: string
  total?: number
  source: DiscoverSourceId
}

export interface SongListPage {
  list: SongListItem[]
  total: number
  page: number
  limit: number
  maxPage: number
  source: DiscoverSourceId
  sortId: string
  tagId: string
}

export interface SongListDetail {
  id: string
  source: DiscoverSourceId
  list: Track[]
  total: number
  page: number
  limit: number
  maxPage: number
  info: {
    name?: string
    coverUrl?: string
    description?: string
    author?: string
    playCount?: string
  }
}

export interface LeaderboardBoardItem {
  id: string
  name: string
  bangId: string
  source: DiscoverSourceId
}

export interface LeaderboardBoardList {
  list: LeaderboardBoardItem[]
  source: DiscoverSourceId
}

export interface LeaderboardDetail {
  id: string
  source: DiscoverSourceId
  list: Track[]
  total: number
  page: number
  limit: number
  maxPage: number
}

export interface SongListSetting {
  source: DiscoverSourceId
  sortId: string
  tagId: string
  tagName: string
}

export interface LeaderboardSetting {
  source: DiscoverSourceId
  boardId: string
}
