import type { TabName } from '../components/common/TabBar'

export type UIOverlay =
  | 'none'
  | 'detail'
  | 'nowPlaying'
  | 'leaderboardMore'
  | 'queue'
  | 'comment'

export interface AppUIState {
  activeTab: TabName
  overlay: UIOverlay
  isDiscoverMoreVisible: boolean
}
