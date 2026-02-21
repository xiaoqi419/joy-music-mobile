import AsyncStorage from '@react-native-async-storage/async-storage'
import { Quality } from '../music'

const MUSIC_SOURCE_SETTINGS_KEY = '@joy_music_source_settings'

const KNOWN_PLATFORM_NAMES: Record<string, string> = {
  kw: '酷我音乐',
  wy: '网易云音乐',
  tx: 'QQ音乐',
  kg: '酷狗音乐',
  mg: '咪咕音乐',
  local: '本地音乐',
}

export const KNOWN_PLATFORM_IDS = ['kw', 'wy', 'tx', 'kg', 'mg', 'local'] as const

export const ALL_QUALITIES: Quality[] = [
  '128k',
  '320k',
  'flac',
  'flac24bit',
  'hires',
  'atmos',
  'atmos_plus',
  'master',
]

const DEFAULT_PLATFORM_QUALITIES: Record<string, Quality[]> = {
  kw: ['128k', '320k', 'flac', 'flac24bit', 'hires'],
  wy: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
  tx: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master'],
  kg: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
  mg: ['128k', '320k', 'flac', 'flac24bit', 'hires'],
  local: [],
}

export interface ImportedSourcePlatform {
  id: string
  name: string
  type: string
  actions: string[]
  qualitys: Quality[]
}

export interface ImportedMusicSource {
  id: string
  name: string
  description?: string
  version?: string
  author?: string
  homepage?: string
  apiUrl: string
  apiKey?: string
  enabled: boolean
  sourceUrl?: string
  createdAt: number
  updatedAt: number
  platforms: Record<string, ImportedSourcePlatform>
  rawScript?: string
}

export interface MusicSourceSettingsSnapshot {
  selectedSourceId: string
  autoSwitch: boolean
  preferredQuality: Quality
  importedSources: ImportedMusicSource[]
}

type ScriptHeaderMeta = {
  name?: string
  description?: string
  version?: string
  author?: string
  homepage?: string
}

let settingsCache: MusicSourceSettingsSnapshot | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

function normalizeQuality(value: unknown): Quality | null {
  if (!value || typeof value !== 'string') return null
  const lower = value.trim().toLowerCase()
  if (ALL_QUALITIES.includes(lower as Quality)) {
    return lower as Quality
  }
  return null
}

function normalizeQualityList(value: unknown): Quality[] {
  if (!Array.isArray(value)) return []
  const unique = new Set<Quality>()
  for (const item of value) {
    const quality = normalizeQuality(item)
    if (quality) unique.add(quality)
  }
  return Array.from(unique)
}

function parseArrayLiteral(raw: string): string[] {
  if (!raw) return []
  const values: string[] = []
  const pattern = /['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(raw)) !== null) {
    values.push(match[1])
  }
  return values
}

function parseScriptHeader(script: string): ScriptHeaderMeta {
  const getField = (field: string): string | undefined => {
    const match = script.match(new RegExp(`@${field}\\s+(.+)`))
    return match ? match[1].trim() : undefined
  }

  return {
    name: getField('name'),
    description: getField('description'),
    version: getField('version'),
    author: getField('author'),
    homepage: getField('homepage'),
  }
}

function extractApiUrl(script: string): string | null {
  const direct = script.match(/const\s+API_URL\s*=\s*['"]([^'"]+)['"]/i)
  if (direct?.[1]) return direct[1].trim()

  const fallback = script.match(/https?:\/\/[^\s'"]+\/music\/url/gi)?.[0]
  if (!fallback) return null
  try {
    const parsed = new URL(fallback)
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return null
  }
}

function extractApiKey(script: string): string | undefined {
  const direct = script.match(/const\s+API_KEY\s*=\s*['"]([^'"]+)['"]/i)
  if (direct?.[1]) return direct[1].trim()

  const header = script.match(/['"]X-Api-Key['"]\s*:\s*['"]([^'"]+)['"]/i)
  if (header?.[1]) return header[1].trim()
  return undefined
}

function normalizePlatformsFromRecord(
  rawRecord: Record<string, any> | null | undefined
): Record<string, ImportedSourcePlatform> {
  const platforms: Record<string, ImportedSourcePlatform> = {}
  if (rawRecord && typeof rawRecord === 'object') {
    Object.entries(rawRecord).forEach(([platformId, raw]) => {
      const normalizedId = String(platformId || '').trim().toLowerCase()
      if (!normalizedId) return
      const rawItem = raw || {}
      const qualitys = normalizeQualityList(rawItem.qualitys)
      const actions = Array.isArray(rawItem.actions)
        ? rawItem.actions.map((item: any) => String(item))
        : []
      platforms[normalizedId] = {
        id: normalizedId,
        name: String(rawItem.name || KNOWN_PLATFORM_NAMES[normalizedId] || normalizedId.toUpperCase()),
        type: String(rawItem.type || 'music'),
        actions,
        qualitys: qualitys.length ? qualitys : (DEFAULT_PLATFORM_QUALITIES[normalizedId] ?? ['128k', '320k']),
      }
    })
  }

  if (Object.keys(platforms).length > 0) {
    return platforms
  }

  const defaultPlatforms: Record<string, ImportedSourcePlatform> = {}
  KNOWN_PLATFORM_IDS.forEach((platformId) => {
    defaultPlatforms[platformId] = {
      id: platformId,
      name: KNOWN_PLATFORM_NAMES[platformId],
      type: 'music',
      actions: platformId === 'local' ? ['musicUrl', 'lyric', 'pic'] : ['musicUrl'],
      qualitys: DEFAULT_PLATFORM_QUALITIES[platformId] ?? ['128k', '320k'],
    }
  })
  return defaultPlatforms
}

function parsePlatformsFromScriptText(script: string): Record<string, ImportedSourcePlatform> {
  const platforms: Record<string, ImportedSourcePlatform> = {}
  KNOWN_PLATFORM_IDS.forEach((platformId) => {
    const blockPattern = new RegExp(
      `["']?${platformId}["']?\\s*:\\s*\\{([\\s\\S]*?)\\}`,
      'i'
    )
    const blockMatch = script.match(blockPattern)
    if (!blockMatch?.[1]) return

    const block = blockMatch[1]
    const name = block.match(/name\s*:\s*['"]([^'"]+)['"]/i)?.[1]
    const type = block.match(/type\s*:\s*['"]([^'"]+)['"]/i)?.[1] || 'music'
    const actionsRaw = block.match(/actions\s*:\s*\[([^\]]*)\]/i)?.[1] || ''
    const qualitysRaw = block.match(/qualitys\s*:\s*\[([^\]]*)\]/i)?.[1] || ''
    const actions = parseArrayLiteral(actionsRaw)
    const qualitys = normalizeQualityList(parseArrayLiteral(qualitysRaw))

    platforms[platformId] = {
      id: platformId,
      name: name || KNOWN_PLATFORM_NAMES[platformId] || platformId.toUpperCase(),
      type,
      actions: actions.length ? actions : (platformId === 'local' ? ['musicUrl', 'lyric', 'pic'] : ['musicUrl']),
      qualitys: qualitys.length ? qualitys : (DEFAULT_PLATFORM_QUALITIES[platformId] ?? ['128k', '320k']),
    }
  })

  return normalizePlatformsFromRecord(platforms)
}

function safePreferredQuality(input: unknown): Quality {
  const quality = normalizeQuality(input)
  return quality ?? 'master'
}

function createSourceId(): string {
  return `source_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function fallbackSourceName(url?: string): string {
  if (!url) return '自定义音源'
  try {
    const parsed = new URL(url)
    return parsed.hostname || '自定义音源'
  } catch {
    return '自定义音源'
  }
}

function getUrlOrigin(url?: string): string {
  if (!url) return ''
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

function normalizeSource(item: ImportedMusicSource): ImportedMusicSource {
  return {
    ...item,
    id: item.id || createSourceId(),
    name: String(item.name || '自定义音源'),
    apiUrl: String(item.apiUrl || '').trim(),
    apiKey: item.apiKey ? String(item.apiKey).trim() : undefined,
    enabled: item.enabled !== false,
    createdAt: Number(item.createdAt || Date.now()),
    updatedAt: Number(item.updatedAt || Date.now()),
    platforms: normalizePlatformsFromRecord(item.platforms),
  }
}

export const DEFAULT_MUSIC_SOURCE_SETTINGS: MusicSourceSettingsSnapshot = {
  selectedSourceId: '',
  autoSwitch: false,
  preferredQuality: 'master',
  importedSources: [],
}

function normalizeImportedSources(importedSources: ImportedMusicSource[]): ImportedMusicSource[] {
  return importedSources
    .map(normalizeSource)
}

function sanitizeSnapshot(raw: any): MusicSourceSettingsSnapshot {
  const importedSources = normalizeImportedSources(Array.isArray(raw?.importedSources) ? raw.importedSources : [])
  const selectedSourceId = importedSources.some((item) => item.id === raw?.selectedSourceId)
    ? raw.selectedSourceId
    : (importedSources[0]?.id ?? '')

  return {
    selectedSourceId,
    autoSwitch: Boolean(raw?.autoSwitch),
    preferredQuality: safePreferredQuality(raw?.preferredQuality),
    importedSources,
  }
}

export async function loadMusicSourceSettings(): Promise<MusicSourceSettingsSnapshot> {
  if (settingsCache) return settingsCache
  try {
    const raw = await AsyncStorage.getItem(MUSIC_SOURCE_SETTINGS_KEY)
    if (!raw) {
      settingsCache = { ...DEFAULT_MUSIC_SOURCE_SETTINGS }
      return settingsCache
    }
    const parsed = JSON.parse(raw)
    settingsCache = sanitizeSnapshot(parsed)
    return settingsCache
  } catch {
    settingsCache = { ...DEFAULT_MUSIC_SOURCE_SETTINGS }
    return settingsCache
  }
}

export function saveMusicSourceSettings(snapshot: MusicSourceSettingsSnapshot): void {
  settingsCache = sanitizeSnapshot(snapshot)
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void AsyncStorage.setItem(MUSIC_SOURCE_SETTINGS_KEY, JSON.stringify(settingsCache))
  }, 220)
}

export interface CreateManualSourceInput {
  name: string
  apiUrl: string
  apiKey?: string
}

export function createManualSource(input: CreateManualSourceInput): ImportedMusicSource {
  const now = Date.now()
  return normalizeSource({
    id: createSourceId(),
    name: input.name.trim() || '自定义音源',
    apiUrl: input.apiUrl.trim(),
    apiKey: input.apiKey?.trim(),
    enabled: true,
    createdAt: now,
    updatedAt: now,
    platforms: normalizePlatformsFromRecord(undefined),
  })
}

export interface ParseScriptSourceOptions {
  sourceUrl?: string
  fallbackName?: string
}

export function createSourceFromScriptText(
  scriptText: string,
  options: ParseScriptSourceOptions = {}
): ImportedMusicSource {
  const headerMeta = parseScriptHeader(scriptText)
  const apiUrl = extractApiUrl(scriptText) || getUrlOrigin(options.sourceUrl)
  const apiKey = extractApiKey(scriptText)
  const platforms = parsePlatformsFromScriptText(scriptText)
  const now = Date.now()

  return normalizeSource({
    id: createSourceId(),
    name: headerMeta.name || options.fallbackName || fallbackSourceName(options.sourceUrl),
    description: headerMeta.description,
    version: headerMeta.version,
    author: headerMeta.author,
    homepage: headerMeta.homepage,
    sourceUrl: options.sourceUrl,
    apiUrl,
    apiKey,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    platforms,
    rawScript: scriptText,
  })
}

export function parseScriptMetaPreview(scriptText: string): ScriptHeaderMeta {
  return parseScriptHeader(scriptText)
}
