/**
 * 歌曲评论服务。
 * 当前仅实现网易云（wy）评论能力。
 */

import type { Track } from '../../types/music'
import { wyRequest } from '../discover/wyCrypto'

const DEFAULT_COMMENT_LIMIT = 20
const MAX_COMMENT_LIMIT = 50
const WY_THREAD_PREFIX = 'R_SO_4_'

export interface TrackCommentQuery {
  limit?: number
  offset?: number
  before?: number
}

export interface TrackComment {
  id: string
  content: string
  time: number
  timeText: string
  userName: string
  userId?: string
  avatarUrl?: string
  location?: string
  likedCount: number
}

export interface TrackCommentResult {
  source: 'wy'
  comments: TrackComment[]
  total: number
  hasMore: boolean
  nextOffset: number
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function formatCommentTime(timestamp: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function pickWySongId(track: Track): string {
  const rawSongmid = String(track.songmid || '').trim()
  if (/^\d+$/.test(rawSongmid)) return rawSongmid

  const rawTrackId = String(track.id || '').trim()
  const prefixedMatch = /^wy_(\d+)$/.exec(rawTrackId)
  if (prefixedMatch?.[1]) return prefixedMatch[1]

  const digitMatch = rawTrackId.match(/(\d{5,})/)
  return digitMatch?.[1] || ''
}

function mapWyComment(raw: any): TrackComment | null {
  const commentId = String(raw?.commentId || '').trim()
  if (!commentId) return null

  const content = String(raw?.content || raw?.richContent || '').trim()
  if (!content) return null

  const time = toNumber(raw?.time, 0)
  const user = raw?.user || {}
  const location = String(raw?.ipLocation?.location || '').trim()

  return {
    id: commentId,
    content,
    time,
    timeText: formatCommentTime(time),
    userName: String(user?.nickname || '匿名用户'),
    userId: user?.userId != null ? String(user.userId) : undefined,
    avatarUrl: String(user?.avatarUrl || '').trim() || undefined,
    location: location || undefined,
    likedCount: toNumber(raw?.likedCount, 0),
  }
}

function mergeUniqueComments(comments: TrackComment[]): TrackComment[] {
  const commentMap = new Map<string, TrackComment>()
  for (const comment of comments) {
    if (!commentMap.has(comment.id)) {
      commentMap.set(comment.id, comment)
    }
  }
  return Array.from(commentMap.values())
}

function buildQuery(limit: number, offset: number, before?: number): string {
  const query = [
    `limit=${encodeURIComponent(String(limit))}`,
    `offset=${encodeURIComponent(String(offset))}`,
  ]
  if (typeof before === 'number' && Number.isFinite(before) && before > 0) {
    query.push(`before=${encodeURIComponent(String(before))}`)
  }
  return query.join('&')
}

async function fetchWyCommentsByOpenApi(
  songId: string,
  limit: number,
  offset: number,
  before?: number,
): Promise<TrackCommentResult> {
  const query = buildQuery(limit, offset, before)
  const url = `https://music.163.com/api/v1/resource/comments/${WY_THREAD_PREFIX}${songId}?${query}`

  const resp = await fetch(url, {
    headers: {
      Referer: 'https://music.163.com',
      'User-Agent': 'Mozilla/5.0',
    },
  })
  if (!resp.ok) {
    throw new Error(`WY comment API HTTP ${resp.status}`)
  }

  const data = await resp.json()
  if (toNumber(data?.code, 0) !== 200) {
    throw new Error(`WY comment API code=${String(data?.code ?? 'unknown')}`)
  }

  const hotComments =
    offset === 0 && Array.isArray(data?.hotComments)
      ? data.hotComments.slice(0, 6)
      : []
  const comments = Array.isArray(data?.comments) ? data.comments : []
  const merged = mergeUniqueComments(
    [...hotComments, ...comments]
      .map((item) => mapWyComment(item))
      .filter((item): item is TrackComment => Boolean(item)),
  )

  const total = toNumber(data?.total, merged.length)
  const normalCount = comments.length
  const nextOffset = offset + normalCount
  const hasMore = Boolean(data?.more) && normalCount > 0 && nextOffset < total

  return {
    source: 'wy',
    comments: merged,
    total,
    hasMore,
    nextOffset,
  }
}

async function fetchWyCommentsByLinuxApi(
  songId: string,
  limit: number,
  offset: number,
  before?: number,
): Promise<TrackCommentResult> {
  const threadId = `${WY_THREAD_PREFIX}${songId}`
  const pageNo = Math.floor(offset / Math.max(1, limit)) + 1

  const resp = await wyRequest('https://music.163.com/api/comment/resource/comments/get', {
    rid: threadId,
    threadId,
    pageNo,
    pageSize: limit,
    offset,
    orderType: 1,
    cursor: before && before > 0 ? String(before) : '-1',
  })

  const body = resp.data?.data || resp.data
  if (toNumber(body?.code, 200) !== 200) {
    throw new Error(`WY comment fallback API code=${String(body?.code ?? 'unknown')}`)
  }

  const comments = Array.isArray(body?.comments) ? body.comments : []
  const merged = comments
    .map((item) => mapWyComment(item))
    .filter((item): item is TrackComment => Boolean(item))
  const total = toNumber(body?.totalCount ?? body?.total, merged.length)
  const nextOffset = offset + comments.length
  const hasMore = nextOffset < total

  return {
    source: 'wy',
    comments: merged,
    total,
    hasMore,
    nextOffset,
  }
}

async function fetchWyTrackComments(
  songId: string,
  query: TrackCommentQuery,
): Promise<TrackCommentResult> {
  const limit = Math.max(1, Math.min(MAX_COMMENT_LIMIT, toNumber(query.limit, DEFAULT_COMMENT_LIMIT)))
  const offset = Math.max(0, toNumber(query.offset, 0))
  const before = typeof query.before === 'number' ? query.before : undefined

  try {
    return await fetchWyCommentsByOpenApi(songId, limit, offset, before)
  } catch (openApiError) {
    console.warn('[Comment] WY open API failed, fallback to linuxapi:', openApiError)
    return fetchWyCommentsByLinuxApi(songId, limit, offset, before)
  }
}

/**
 * 按歌曲获取评论（目前仅支持网易云）。
 */
export async function getTrackComments(
  track: Track,
  query: TrackCommentQuery = {},
): Promise<TrackCommentResult> {
  const source = String(track.source || '').toLowerCase()
  if (source !== 'wy') {
    throw new Error('当前仅支持网易云歌曲评论')
  }

  const songId = pickWySongId(track)
  if (!songId) {
    throw new Error('当前歌曲缺少网易云歌曲 ID，无法加载评论')
  }

  return fetchWyTrackComments(songId, query)
}

