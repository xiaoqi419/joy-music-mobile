import {
  DiscoverSourceId,
  LeaderboardBoardList,
  LeaderboardDetail,
  SongListDetail,
  SongListPage,
  SongListSortInfo,
  SongListTagInfo,
} from '../../../types/discover'

export interface DiscoverSourceAdapter {
  id: DiscoverSourceId
  name: string
  songList: {
    sortList: SongListSortInfo[]
    getTags: () => Promise<{ tags: SongListTagInfo[]; hotTags: SongListTagInfo[] }>
    getList: (sortId: string, tagId: string, page: number) => Promise<SongListPage>
    getListDetail: (id: string, page: number) => Promise<SongListDetail>
  }
  leaderboard: {
    getBoards: () => Promise<LeaderboardBoardList>
    getList: (boardId: string, page: number) => Promise<LeaderboardDetail>
  }
}
