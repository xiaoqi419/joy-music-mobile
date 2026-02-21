/**
 * Music source reducer for managing audio source state.
 */

import { MusicSourceInfo, Quality } from '../../core/music'
import {
  DEFAULT_MUSIC_SOURCE_SETTINGS,
  ImportedMusicSource,
  MusicSourceSettingsSnapshot,
} from '../../core/config/musicSource'

export interface MusicSourceState {
  currentSourceId: string
  availableSources: MusicSourceInfo[]
  preferredQuality: Quality
  isLoadingUrl: boolean
  lastError: string | null
  importedSources: ImportedMusicSource[]
  selectedImportedSourceId: string
  autoSwitch: boolean
}

const initialState: MusicSourceState = {
  currentSourceId: 'joy',
  availableSources: [],
  preferredQuality: DEFAULT_MUSIC_SOURCE_SETTINGS.preferredQuality,
  isLoadingUrl: false,
  lastError: null,
  importedSources: DEFAULT_MUSIC_SOURCE_SETTINGS.importedSources,
  selectedImportedSourceId: DEFAULT_MUSIC_SOURCE_SETTINGS.selectedSourceId,
  autoSwitch: DEFAULT_MUSIC_SOURCE_SETTINGS.autoSwitch,
}

interface MusicSourceAction {
  type: string
  payload?: any
}

function normalizeImportedSources(importedSources: ImportedMusicSource[]): ImportedMusicSource[] {
  return importedSources.map((item) => ({
    ...item,
    id: String(item.id),
    name: String(item.name || '自定义音源'),
    apiUrl: String(item.apiUrl || '').trim(),
    apiKey: item.apiKey ? String(item.apiKey).trim() : undefined,
    enabled: item.enabled !== false,
    createdAt: Number(item.createdAt || Date.now()),
    updatedAt: Number(item.updatedAt || Date.now()),
  }))
}

function sanitizeSelectedSourceId(importedSources: ImportedMusicSource[], selectedId: string): string {
  if (!importedSources.length) return ''
  if (selectedId && importedSources.some((item) => item.id === selectedId)) return selectedId
  return importedSources[0].id
}

function applySettingsSnapshot(state: MusicSourceState, snapshot: MusicSourceSettingsSnapshot): MusicSourceState {
  const importedSources = normalizeImportedSources(snapshot.importedSources || [])
  return {
    ...state,
    preferredQuality: snapshot.preferredQuality || state.preferredQuality,
    autoSwitch: Boolean(snapshot.autoSwitch),
    importedSources,
    selectedImportedSourceId: sanitizeSelectedSourceId(importedSources, snapshot.selectedSourceId || ''),
  }
}

export default function musicSourceReducer(
  state = initialState,
  action: MusicSourceAction,
): MusicSourceState {
  switch (action.type) {
    case 'MUSIC_SOURCE_HYDRATE_SETTINGS':
      return applySettingsSnapshot(state, action.payload as MusicSourceSettingsSnapshot)

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

    case 'MUSIC_SOURCE_SET_SELECTED_IMPORTED': {
      const selectedImportedSourceId = sanitizeSelectedSourceId(
        state.importedSources,
        String(action.payload || ''),
      )
      return {
        ...state,
        selectedImportedSourceId,
      }
    }

    case 'MUSIC_SOURCE_SET_AUTO_SWITCH':
      return {
        ...state,
        autoSwitch: Boolean(action.payload),
      }

    case 'MUSIC_SOURCE_ADD_IMPORTED': {
      const incoming = action.payload as ImportedMusicSource
      if (!incoming?.id) return state
      if (state.importedSources.some((item) => item.id === incoming.id)) {
        return state
      }
      const importedSources = normalizeImportedSources([
        ...state.importedSources,
        {
          ...incoming,
          updatedAt: Date.now(),
        },
      ])
      return {
        ...state,
        importedSources,
        selectedImportedSourceId: state.selectedImportedSourceId || incoming.id,
      }
    }

    case 'MUSIC_SOURCE_UPDATE_IMPORTED': {
      const { id, patch } = action.payload || {}
      if (!id || !patch) return state
      const importedSources = normalizeImportedSources(
        state.importedSources.map((item) => (
          item.id === id
            ? {
                ...item,
                ...patch,
                id: item.id,
                updatedAt: Date.now(),
              }
            : item
        )),
      )
      return {
        ...state,
        importedSources,
      }
    }

    case 'MUSIC_SOURCE_DELETE_IMPORTED': {
      const targetId = String(action.payload || '')
      if (!targetId) return state
      const importedSources = state.importedSources.filter((item) => item.id !== targetId)
      return {
        ...state,
        importedSources,
        selectedImportedSourceId: sanitizeSelectedSourceId(importedSources, state.selectedImportedSourceId),
      }
    }

    case 'MUSIC_SOURCE_TOGGLE_IMPORTED_ENABLED': {
      const { id, enabled } = action.payload || {}
      if (!id) return state
      const importedSources = state.importedSources.map((item) => (
        item.id === id
          ? { ...item, enabled: typeof enabled === 'boolean' ? enabled : !item.enabled, updatedAt: Date.now() }
          : item
      ))
      return {
        ...state,
        importedSources,
      }
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
