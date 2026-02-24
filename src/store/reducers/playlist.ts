/**
 * Playlist reducer for managing playlists
 */

import { Playlist } from '../../types/music'

interface PlaylistState {
  playlists: Playlist[]
  currentPlaylistId: string | null
}

const initialState: PlaylistState = {
  playlists: [],
  currentPlaylistId: null,
}

interface PlaylistAction {
  type: string
  payload?: any
}

export default function playlistReducer(
  state = initialState,
  action: PlaylistAction,
): PlaylistState {
  switch (action.type) {
    case 'PLAYLIST_HYDRATE':
      return {
        ...state,
        playlists: Array.isArray(action.payload?.playlists) ? action.payload.playlists : [],
        currentPlaylistId: action.payload?.currentPlaylistId ?? null,
      }

    case 'PLAYLIST_ADD':
      return {
        ...state,
        playlists: [...state.playlists, action.payload],
      }

    case 'PLAYLIST_REMOVE':
      return {
        ...state,
        playlists: state.playlists.filter(p => p.id !== action.payload),
      }

    case 'PLAYLIST_UPDATE':
      return {
        ...state,
        playlists: state.playlists.map(p =>
          p.id === action.payload.id ? action.payload : p,
        ),
      }

    case 'PLAYLIST_SET_CURRENT':
      return {
        ...state,
        currentPlaylistId: action.payload,
      }

    default:
      return state
  }
}
