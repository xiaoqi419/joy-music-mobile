import { DiscoverSourceId } from '../../../types/discover'
import { kwDiscoverSource } from './kw'
import { wyDiscoverSource } from './wy'
import { DiscoverSourceAdapter } from './types'

const fallbackAdapter = (id: DiscoverSourceId, name: string): DiscoverSourceAdapter => ({
  id,
  name,
  songList: {
    sortList: kwDiscoverSource.songList.sortList,
    getTags: kwDiscoverSource.songList.getTags,
    getList: kwDiscoverSource.songList.getList,
    getListDetail: kwDiscoverSource.songList.getListDetail,
  },
  leaderboard: {
    getBoards: wyDiscoverSource.leaderboard.getBoards,
    getList: wyDiscoverSource.leaderboard.getList,
  },
})

export const discoverSources: Record<DiscoverSourceId, DiscoverSourceAdapter> = {
  kw: kwDiscoverSource,
  wy: wyDiscoverSource,
  tx: fallbackAdapter('tx', 'QQ Music'),
  kg: fallbackAdapter('kg', 'Kugou'),
  mg: fallbackAdapter('mg', 'Migu'),
}

export const discoverSourceList: Array<{ id: DiscoverSourceId; name: string }> = [
  { id: 'kw', name: 'KW' },
  { id: 'wy', name: 'WY' },
  { id: 'tx', name: 'TX' },
  { id: 'kg', name: 'KG' },
  { id: 'mg', name: 'MG' },
]
