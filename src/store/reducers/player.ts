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

    case 'PLAYER_SYNC_STATE': {
      const p = action.payload
      // 仅当结构字段有变化时才生成新 state，纯 position 变化走轻量路径
      const trackChanged = p.currentTrack !== state.currentTrack
        && (p.currentTrack?.id !== state.currentTrack?.id)
      const structChanged = trackChanged
        || p.isPlaying !== state.isPlaying
        || p.currentIndex !== state.currentIndex
        || p.playlist !== state.playlist
        || p.repeatMode !== state.repeatMode
        || p.shuffleMode !== state.shuffleMode
        || p.volume !== state.volume

      if (!structChanged
        && p.currentTime === state.currentTime
        && p.duration === state.duration) {
        return state
      }

      if (!structChanged) {
        // 仅 position/duration 变化：仍需新对象以触发依赖的组件更新，
        // 但跳过不必要的属性复制
        return {
          ...state,
          currentTime: p.currentTime ?? state.currentTime,
          duration: p.duration ?? state.duration,
        }
      }

      return {
        ...state,
        ...p,
      }
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
