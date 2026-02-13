/**
 * Music source reducer for managing audio source state
 */

import { MusicSourceInfo, Quality } from '../../core/music'

export interface MusicSourceState {
  currentSourceId: string
  availableSources: MusicSourceInfo[]
  preferredQuality: Quality
  isLoadingUrl: boolean
  lastError: string | null
}

const initialState: MusicSourceState = {
  currentSourceId: 'ikun',
  availableSources: [],
  preferredQuality: '320k',
  isLoadingUrl: false,
  lastError: null,
}

interface MusicSourceAction {
  type: string
  payload?: any
}

export default function musicSourceReducer(
  state = initialState,
  action: MusicSourceAction,
): MusicSourceState {
  switch (action.type) {
    case 'MUSIC_SOURCE_SET_SOURCES':
      return {
        ...state,
        availableSources: action.payload,
      }

    case 'MUSIC_SOURCE_SET_CURRENT':
      return {
        ...state,
        currentSourceId: action.payload,
        lastError: null,
      }

    case 'MUSIC_SOURCE_SET_QUALITY':
      return {
        ...state,
        preferredQuality: action.payload,
      }

    case 'MUSIC_SOURCE_SET_LOADING':
      return {
        ...state,
        isLoadingUrl: action.payload,
      }

    case 'MUSIC_SOURCE_SET_ERROR':
      return {
        ...state,
        lastError: action.payload,
      }

    case 'MUSIC_SOURCE_CLEAR_ERROR':
      return {
        ...state,
        lastError: null,
      }

    default:
      return state
  }
}
