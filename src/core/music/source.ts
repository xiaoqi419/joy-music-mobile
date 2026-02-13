/**
 * Music source management system
 * Handles multiple music sources and their APIs
 * Based on lx-music-mobile architecture
 */
import type {
  LeaderboardBoardList,
  LeaderboardDetail,
  SongListDetail,
  SongListPage,
  SongListSortInfo,
  SongListTagInfo,
} from '../../types/discover'

export interface MusicSourceInfo {
  id: string
  name: string
  enabled: boolean
  supportedQualities: Quality[]
}

export type Quality = '128k' | '320k' | 'flac' | 'flac24bit' | 'hires' | 'atmos' | 'master'

export interface MusicSourceAPI {
  id: string
  name: string
  getMusicUrl(musicInfo: any, quality: Quality): Promise<string>
  getPicUrl?(musicInfo: any): Promise<string>
  getLyricInfo?(musicInfo: any): Promise<any>
  search?(keyword: string, page: number, limit: number): Promise<any>
  songList?: {
    sortList: SongListSortInfo[]
    getTags: () => Promise<{ tags: SongListTagInfo[]; hotTags: SongListTagInfo[] }>
    getList: (sortId: string, tagId: string, page: number) => Promise<SongListPage>
    getListDetail: (id: string, page: number) => Promise<SongListDetail>
  }
  leaderboard?: {
    getBoards: () => Promise<LeaderboardBoardList>
    getList: (boardId: string, page: number) => Promise<LeaderboardDetail>
  }
}

/**
 * Music source registry
 * Manages available music sources and their implementations
 */
class MusicSourceManager {
  private sources: Map<string, MusicSourceAPI> = new Map()
  private sourceInfos: Map<string, MusicSourceInfo> = new Map()
  private currentSourceId: string = 'ikun'

  /**
   * Register a music source
   */
  registerSource(api: MusicSourceAPI, info: MusicSourceInfo): void {
    this.sources.set(api.id, api)
    this.sourceInfos.set(api.id, info)
  }

  /**
   * Get a registered source API
   */
  getSource(sourceId: string): MusicSourceAPI | undefined {
    return this.sources.get(sourceId)
  }

  /**
   * Get all available sources
   */
  getAllSources(): MusicSourceInfo[] {
    return Array.from(this.sourceInfos.values())
  }

  /**
   * Set current active source
   */
  setCurrentSource(sourceId: string): boolean {
    if (this.sources.has(sourceId)) {
      this.currentSourceId = sourceId
      return true
    }
    return false
  }

  /**
   * Get current active source
   */
  getCurrentSource(): MusicSourceAPI | undefined {
    return this.sources.get(this.currentSourceId)
  }

  /**
   * Get current source ID
   */
  getCurrentSourceId(): string {
    return this.currentSourceId
  }

  /**
   * Check if source is available
   */
  isSourceAvailable(sourceId: string): boolean {
    const info = this.sourceInfos.get(sourceId)
    return info ? info.enabled : false
  }

  /**
   * Get supported qualities for a source
   */
  getSourceQualities(sourceId: string): Quality[] {
    const info = this.sourceInfos.get(sourceId)
    return info ? info.supportedQualities : []
  }
}

export const musicSourceManager = new MusicSourceManager()
