/**
 * Audio file cache manager.
 * - 自动将已解析的可播放 HTTP 链接下载到本地
 * - 下次播放优先命中本地文件，避免再次走远端 API
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system/legacy'
import { Quality } from './source'

const AUDIO_CACHE_SETTINGS_KEY = '@joy_music_audio_cache_settings'
const AUDIO_CACHE_INDEX_KEY = '@joy_music_audio_cache_index'
const AUDIO_CACHE_DIR_NAME = 'joy_audio_cache'

const DEFAULT_AUDIO_CACHE_SETTINGS: AudioCacheSettings = {
  enabled: true,
}

const SUPPORTED_EXTS = new Set([
  'mp3',
  'm4a',
  'aac',
  'flac',
  'wav',
  'ogg',
  'opus',
  'webm',
  'mp4',
])

const AUDIO_CACHE_DOWNLOAD_HEADERS = {
  Accept: '*/*',
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
}

export interface AudioCacheSettings {
  enabled: boolean
}

export interface CachedAudioFileEntry {
  musicId: string
  fileUri: string
  quality: Quality
  source: string
  size: number
  updatedAt: number
  title?: string
  artist?: string
}

export interface AudioCacheStats {
  enabled: boolean
  fileCount: number
  sizeBytes: number
}

export interface AudioCacheStoreRequest {
  musicId: string
  url: string
  quality: Quality
  source: string
  title?: string
  artist?: string
}

function safeFileName(input: string): string {
  const normalized = String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || 'track'
}

function inferFileExtension(url: string): string {
  const clean = String(url || '').split('?')[0].split('#')[0]
  const match = clean.match(/\.([a-zA-Z0-9]{2,5})$/)
  const rawExt = (match?.[1] || '').toLowerCase()
  if (!rawExt) return 'mp3'
  if (rawExt === 'm4s') return 'm4a'
  if (SUPPORTED_EXTS.has(rawExt)) return rawExt
  return 'mp3'
}

function getDownloadCandidates(url: string): string[] {
  const first = String(url || '').trim()
  if (!first) return []
  const candidates = [first]
  if (/^http:\/\//i.test(first)) {
    const httpsVersion = first.replace(/^http:/i, 'https:')
    return Array.from(new Set([httpsVersion, first]))
  }
  return Array.from(new Set(candidates))
}

function formatCacheError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

async function getCacheDir(): Promise<string> {
  const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory
  if (!baseDir) {
    throw new Error('FileSystem directory unavailable')
  }
  return `${baseDir}${AUDIO_CACHE_DIR_NAME}/`
}

class AudioFileCacheManager {
  private settingsCache: AudioCacheSettings | null = null
  private indexCache: Record<string, CachedAudioFileEntry> | null = null
  private inFlightTasks = new Map<string, Promise<void>>()

  private async ensureDir(): Promise<string> {
    const dir = await getCacheDir()
    const info = await FileSystem.getInfoAsync(dir)
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true })
    }
    return dir
  }

  private async readSettings(): Promise<AudioCacheSettings> {
    if (this.settingsCache) return this.settingsCache
    try {
      const raw = await AsyncStorage.getItem(AUDIO_CACHE_SETTINGS_KEY)
      if (!raw) {
        this.settingsCache = DEFAULT_AUDIO_CACHE_SETTINGS
        return this.settingsCache
      }
      const parsed = JSON.parse(raw || '{}')
      this.settingsCache = {
        enabled: parsed?.enabled !== false,
      }
      return this.settingsCache
    } catch {
      this.settingsCache = DEFAULT_AUDIO_CACHE_SETTINGS
      return this.settingsCache
    }
  }

  private async saveSettings(settings: AudioCacheSettings): Promise<void> {
    this.settingsCache = settings
    await AsyncStorage.setItem(AUDIO_CACHE_SETTINGS_KEY, JSON.stringify(settings))
  }

  private async readIndex(): Promise<Record<string, CachedAudioFileEntry>> {
    if (this.indexCache) return this.indexCache
    try {
      const raw = await AsyncStorage.getItem(AUDIO_CACHE_INDEX_KEY)
      if (!raw) {
        this.indexCache = {}
        return this.indexCache
      }
      const parsed = JSON.parse(raw || '{}')
      const normalized: Record<string, CachedAudioFileEntry> = {}
      Object.entries(parsed || {}).forEach(([id, entry]) => {
        if (!entry || typeof entry !== 'object') return
        const value = entry as CachedAudioFileEntry
        if (!value.fileUri) return
        normalized[id] = {
          ...value,
          musicId: value.musicId || id,
          updatedAt: Number(value.updatedAt || Date.now()),
          size: Number(value.size || 0),
        }
      })
      this.indexCache = normalized
      return normalized
    } catch {
      this.indexCache = {}
      return this.indexCache
    }
  }

  private async saveIndex(index: Record<string, CachedAudioFileEntry>): Promise<void> {
    this.indexCache = index
    await AsyncStorage.setItem(AUDIO_CACHE_INDEX_KEY, JSON.stringify(index))
  }

  private async removeFileIfExists(uri?: string): Promise<void> {
    if (!uri) return
    try {
      const info = await FileSystem.getInfoAsync(uri)
      if (info.exists) {
        await FileSystem.deleteAsync(uri, { idempotent: true })
      }
    } catch {
      // ignore
    }
  }

  async getSettings(): Promise<AudioCacheSettings> {
    return this.readSettings()
  }

  async setEnabled(enabled: boolean): Promise<void> {
    const next = {
      ...(await this.readSettings()),
      enabled: Boolean(enabled),
    }
    await this.saveSettings(next)
  }

  async resolveCachedPlayableUrl(musicId: string): Promise<{ uri: string; quality: Quality } | null> {
    const settings = await this.readSettings()
    if (!settings.enabled) return null

    const index = await this.readIndex()
    const entry = index[musicId]
    if (!entry?.fileUri) return null

    try {
      const info = await FileSystem.getInfoAsync(entry.fileUri)
      if (!info.exists) {
        delete index[musicId]
        await this.saveIndex(index)
        return null
      }
      const nextSize = typeof info.size === 'number' ? info.size : entry.size
      if (nextSize !== entry.size) {
        index[musicId] = {
          ...entry,
          size: nextSize,
        }
        await this.saveIndex(index)
      }
      return {
        uri: entry.fileUri,
        quality: entry.quality,
      }
    } catch {
      return null
    }
  }

  async cacheFromUrl(request: AudioCacheStoreRequest): Promise<void> {
    const { musicId, url, quality, source, title, artist } = request
    if (!musicId || !/^https?:\/\//i.test(url || '')) return

    const settings = await this.readSettings()
    if (!settings.enabled) return

    const existingTask = this.inFlightTasks.get(musicId)
    if (existingTask) return existingTask

    const task = (async() => {
      console.log(`[AudioCache] Start cache task for ${musicId}`)
      const dir = await this.ensureDir()
      const index = await this.readIndex()
      const previous = index[musicId]

      if (previous?.fileUri) {
        const previousInfo = await FileSystem.getInfoAsync(previous.fileUri)
        if (previousInfo.exists && previous.source === source && previous.quality === quality) {
          console.log(`[AudioCache] Skip existing cache for ${musicId}`)
          return
        }
      }

      const ext = inferFileExtension(url)
      const fileNamePrefix = `${safeFileName(musicId)}_${Date.now()}`

      let downloadResult: FileSystem.FileSystemDownloadResult | null = null
      let usedUrl = url
      let usedTargetUri = ''
      const candidates = getDownloadCandidates(url)

      for (let i = 0; i < candidates.length; i++) {
        const candidateUrl = candidates[i]
        const targetUri = `${dir}${fileNamePrefix}_${i}.${ext}`
        try {
          await this.ensureDir()
          console.log(
            `[AudioCache] Downloading ${musicId} (${i + 1}/${candidates.length}) ${candidateUrl}`
          )
          const result = await FileSystem.downloadAsync(candidateUrl, targetUri, {
            headers: AUDIO_CACHE_DOWNLOAD_HEADERS,
          })
          if (result.status >= 200 && result.status < 300) {
            downloadResult = result
            usedUrl = candidateUrl
            usedTargetUri = targetUri
            break
          }
          await this.removeFileIfExists(targetUri)
          console.warn(
            `[AudioCache] Download status ${result.status} for ${musicId} (${candidateUrl})`
          )
        } catch (error) {
          await this.removeFileIfExists(targetUri)
          console.warn(
            `[AudioCache] Download failed for ${musicId} (${candidateUrl}): ${formatCacheError(error)}`
          )
        }
      }

      if (!downloadResult) {
        throw new Error(`download failed for ${musicId}`)
      }

      const finalUri = usedTargetUri || downloadResult.uri
      const fileInfo = await FileSystem.getInfoAsync(finalUri)
      if (!fileInfo.exists) {
        throw new Error('download file missing after complete')
      }

      const size = typeof fileInfo.size === 'number' ? fileInfo.size : 0
      index[musicId] = {
        musicId,
        fileUri: finalUri,
        quality,
        source,
        size,
        updatedAt: Date.now(),
        title,
        artist,
      }
      await this.saveIndex(index)
      console.log(
        `[AudioCache] Cached file saved for ${musicId} (${size} bytes, ${usedUrl})`
      )

      if (previous?.fileUri && previous.fileUri !== finalUri) {
        await this.removeFileIfExists(previous.fileUri)
      }
    })()
      .catch((error) => {
        console.warn('[AudioCache] Cache store failed:', formatCacheError(error), {
          musicId,
          source,
          quality,
          url,
        })
      })
      .finally(() => {
        this.inFlightTasks.delete(musicId)
      })

    this.inFlightTasks.set(musicId, task)
    return task
  }

  async getStats(): Promise<AudioCacheStats> {
    const settings = await this.readSettings()
    const index = await this.readIndex()
    const nextIndex: Record<string, CachedAudioFileEntry> = {}
    let fileCount = 0
    let sizeBytes = 0
    let changed = false

    for (const [musicId, entry] of Object.entries(index)) {
      try {
        const info = await FileSystem.getInfoAsync(entry.fileUri)
        if (!info.exists) {
          changed = true
          continue
        }
        const size = typeof info.size === 'number' ? info.size : entry.size
        nextIndex[musicId] = {
          ...entry,
          size,
        }
        if (size !== entry.size) changed = true
        fileCount += 1
        sizeBytes += Math.max(0, size)
      } catch {
        changed = true
      }
    }

    if (changed || Object.keys(nextIndex).length !== Object.keys(index).length) {
      await this.saveIndex(nextIndex)
    }

    return {
      enabled: settings.enabled,
      fileCount,
      sizeBytes,
    }
  }

  async clearAllCachedAudio(): Promise<void> {
    const dir = await getCacheDir()
    try {
      await FileSystem.deleteAsync(dir, { idempotent: true })
    } catch {
      // ignore
    }
    await this.ensureDir()
    await this.saveIndex({})
  }
}

export function formatCacheSize(sizeBytes: number): string {
  const size = Math.max(0, Number(sizeBytes || 0))
  if (size < 1024) return `${size} B`
  const kb = size / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(2)} GB`
}

export const audioFileCache = new AudioFileCacheManager()
