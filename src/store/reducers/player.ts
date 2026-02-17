/**
 * Player reducer for managing playback state
 */

import { PlayerState, Track } from '../../types/music'

const initialState: PlayerState = {
  currentTrack: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  playlist: [],
  currentIndex: -1,
  volume: 1.0,
  repeatMode: 'all',
  shuffleMode: false,
}

interface PlayerAction {
  type: string
  payload?: any
}

export default function playerReducer(
  state = initialState,
  action: PlayerAction,
): PlayerState {
  switch (action.type) {
    case 'PLAYER_SET_PLAYLIST':
      return {
        ...state,
        playlist: action.payload,
        currentIndex: 0,
        currentTrack: action.payload.length > 0 ? action.payload[0] : null,
      }

    case 'PLAYER_SET_CURRENT_TRACK':
      return {
        ...state,
        currentTrack: action.payload,
      }

    case 'PLAYER_SYNC_STATE':
      return {
        ...state,
        ...action.payload,
      }

    case 'PLAYER_PLAY':
      return {
        ...state,
        isPlaying: true,
      }

    case 'PLAYER_PAUSE':
      return {
        ...state,
        isPlaying: false,
      }

    case 'PLAYER_SET_CURRENT_TIME':
      return {
        ...state,
        currentTime: action.payload,
      }

    case 'PLAYER_SET_DURATION':
      return {
        ...state,
        duration: action.payload,
      }

    case 'PLAYER_SET_VOLUME':
      return {
        ...state,
        volume: Math.max(0, Math.min(1, action.payload)),
      }

    case 'PLAYER_SET_REPEAT_MODE':
      return {
        ...state,
        repeatMode: action.payload,
      }

    case 'PLAYER_TOGGLE_SHUFFLE':
      return {
        ...state,
        shuffleMode: !state.shuffleMode,
      }

    case 'PLAYER_NEXT':
      const nextIndex = Math.min(state.currentIndex + 1, state.playlist.length - 1)
      return {
        ...state,
        currentIndex: nextIndex,
        currentTrack: state.playlist[nextIndex] || null,
      }

    case 'PLAYER_PREVIOUS':
      const prevIndex = Math.max(state.currentIndex - 1, 0)
      return {
        ...state,
        currentIndex: prevIndex,
        currentTrack: state.playlist[prevIndex] || null,
      }

    default:
      return state
  }
}
