/**
 * GitHub release based update checker.
 */

import { compareVersion, normalizeVersion } from './version'

export type UpdateCheckStatus = 'has_update' | 'up_to_date' | 'failed'

export interface UpdateCheckResult {
  status: UpdateCheckStatus
  currentVersion: string
  latestVersion?: string
  releaseUrl?: string
  ipaUrl?: string
  notes?: string
  reason?: string
}

export interface CheckGithubReleaseUpdateInput {
  owner: string
  repo: string
  currentVersion: string
  requestTimeoutMs?: number
}

interface GithubReleaseAsset {
  browser_download_url?: string
  name?: string
}

interface GithubReleaseResponse {
  assets?: GithubReleaseAsset[]
  body?: string
  html_url?: string
  tag_name?: string
}

function buildReleaseHomeUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}/releases`
}

function buildLatestReleaseApiUrl(owner: string, repo: string): string {
  return `https://api.github.com/repos/${owner}/${repo}/releases/latest`
}

function parseErrorReason(status: number): string {
  if (status === 403 || status === 429) return 'GitHub API rate limit reached. Please try again later.'
  if (status === 404) return 'No release found. Please publish a GitHub Release first.'
  return `GitHub API request failed (HTTP ${status})`
}

export async function checkGithubReleaseUpdate(input: CheckGithubReleaseUpdateInput): Promise<UpdateCheckResult> {
  const owner = String(input.owner || '').trim()
  const repo = String(input.repo || '').trim()
  const currentVersion = normalizeVersion(input.currentVersion)
  const requestTimeoutMs = Math.max(2000, Number(input.requestTimeoutMs || 8000))

  if (!owner || !repo) {
    return {
      status: 'failed',
      currentVersion,
      reason: 'GitHub repository is not configured.',
    }
  }

  const releaseHomeUrl = buildReleaseHomeUrl(owner, repo)
  const requestUrl = buildLatestReleaseApiUrl(owner, repo)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)

  try {
    const resp = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
      },
      signal: controller.signal,
    })

    if (!resp.ok) {
      return {
        status: 'failed',
        currentVersion,
        releaseUrl: releaseHomeUrl,
        reason: parseErrorReason(resp.status),
      }
    }

    const data = await resp.json() as GithubReleaseResponse
    const latestVersion = normalizeVersion(String(data.tag_name || '0.0.0'))
    const notes = String(data.body || '').trim()
    const releaseUrl = String(data.html_url || releaseHomeUrl)
    const ipaAsset = Array.isArray(data.assets)
      ? data.assets.find((asset) => String(asset.name || '').toLowerCase().endsWith('.ipa'))
      : undefined
    const ipaUrl = ipaAsset?.browser_download_url ? String(ipaAsset.browser_download_url) : undefined

    if (!latestVersion || latestVersion === '0.0.0') {
      return {
        status: 'failed',
        currentVersion,
        releaseUrl,
        reason: 'Invalid latest version tag. Please check your release tag format.',
      }
    }

    if (compareVersion(currentVersion, latestVersion) < 0) {
      return {
        status: 'has_update',
        currentVersion,
        latestVersion,
        releaseUrl,
        ipaUrl,
        notes,
      }
    }

    return {
      status: 'up_to_date',
      currentVersion,
      latestVersion,
      releaseUrl,
      ipaUrl,
      notes,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update check failed.'
    const isAbort = error instanceof Error && /abort/i.test(error.name)
    return {
      status: 'failed',
      currentVersion,
      releaseUrl: releaseHomeUrl,
      reason: isAbort ? 'Update check timeout. Please try again later.' : message,
    }
  } finally {
    clearTimeout(timeout)
  }
}