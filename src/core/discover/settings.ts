import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  DiscoverSourceId,
  LeaderboardSetting,
  SongListSetting,
} from '../../types/discover'

const SONG_LIST_KEY = '@joy_discover_songlist_setting'
const LEADERBOARD_KEY = '@joy_discover_leaderboard_setting'

export const DEFAULT_SONGLIST_SETTING: SongListSetting = {
  source: 'kw',
  sortId: 'new',
  tagId: '',
  tagName: '',
}

export const DEFAULT_LEADERBOARD_SETTING: LeaderboardSetting = {
  source: 'kw',
  boardId: 'kw__16',
}

let songListCache: SongListSetting | null = null
let leaderboardCache: LeaderboardSetting | null = null
let saveSongListTimer: ReturnType<typeof setTimeout> | null = null
let saveLeaderboardTimer: ReturnType<typeof setTimeout> | null = null

function safeSource(input: any): DiscoverSourceId {
  return ['kw', 'wy', 'tx', 'kg'].includes(input) ? input : 'kw'
}

export async function getSongListSetting(): Promise<SongListSetting> {
  if (songListCache) return { ...songListCache }
  const raw = await AsyncStorage.getItem(SONG_LIST_KEY)
  if (!raw) {
    songListCache = { ...DEFAULT_SONGLIST_SETTING }
    return { ...songListCache }
  }
  try {
    const parsed = JSON.parse(raw)
    const source = safeSource(parsed.source)
    const sourceChanged = source !== parsed.source
    songListCache = {
      source,
      sortId: sourceChanged
        ? DEFAULT_SONGLIST_SETTING.sortId
        : String(parsed.sortId || DEFAULT_SONGLIST_SETTING.sortId),
      tagId: sourceChanged ? '' : String(parsed.tagId || ''),
      tagName: sourceChanged ? '' : String(parsed.tagName || ''),
    }
    return { ...songListCache }
  } catch {
    songListCache = { ...DEFAULT_SONGLIST_SETTING }
    return { ...songListCache }
  }
}

export async function saveSongListSetting(
  patch: Partial<SongListSetting>
): Promise<void> {
  const current = await getSongListSetting()
  songListCache = {
    ...current,
    ...patch,
    source: safeSource(patch.source ?? current.source),
  }
  if (saveSongListTimer) clearTimeout(saveSongListTimer)
  saveSongListTimer = setTimeout(() => {
    void AsyncStorage.setItem(SONG_LIST_KEY, JSON.stringify(songListCache))
  }, 250)
}

export async function getLeaderboardSetting(): Promise<LeaderboardSetting> {
  if (leaderboardCache) return { ...leaderboardCache }
  const raw = await AsyncStorage.getItem(LEADERBOARD_KEY)
  if (!raw) {
    leaderboardCache = { ...DEFAULT_LEADERBOARD_SETTING }
    return { ...leaderboardCache }
  }
  try {
    const parsed = JSON.parse(raw)
    const source = safeSource(parsed.source)
    const sourceChanged = source !== parsed.source
    leaderboardCache = {
      source,
      boardId: sourceChanged
        ? DEFAULT_LEADERBOARD_SETTING.boardId
        : String(parsed.boardId || DEFAULT_LEADERBOARD_SETTING.boardId),
    }
    return { ...leaderboardCache }
  } catch {
    leaderboardCache = { ...DEFAULT_LEADERBOARD_SETTING }
    return { ...leaderboardCache }
  }
}

export async function saveLeaderboardSetting(
  patch: Partial<LeaderboardSetting>
): Promise<void> {
  const current = await getLeaderboardSetting()
  leaderboardCache = {
    ...current,
    ...patch,
    source: safeSource(patch.source ?? current.source),
  }
  if (saveLeaderboardTimer) clearTimeout(saveLeaderboardTimer)
  saveLeaderboardTimer = setTimeout(() => {
    void AsyncStorage.setItem(LEADERBOARD_KEY, JSON.stringify(leaderboardCache))
  }, 250)
}
