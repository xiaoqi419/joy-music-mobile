/**
 * Utilities for normalizing and comparing semantic versions.
 */

function toNumericPart(input: string): number {
  const matched = String(input || '').match(/\d+/)?.[0] ?? '0'
  const parsed = Number(matched)
  return Number.isFinite(parsed) ? parsed : 0
}

function toVersionParts(version: string): number[] {
  const normalized = String(version || '')
    .trim()
    .replace(/^v/i, '')

  if (!normalized) return [0, 0, 0]

  const parts = normalized
    .split('.')
    .map((part) => toNumericPart(part))

  while (parts.length < 3) {
    parts.push(0)
  }

  return parts
}

export function normalizeVersion(version: string): string {
  return toVersionParts(version).join('.')
}

export function compareVersion(a: string, b: string): number {
  const left = toVersionParts(a)
  const right = toVersionParts(b)
  const maxLength = Math.max(left.length, right.length)

  for (let index = 0; index < maxLength; index += 1) {
    const lv = left[index] ?? 0
    const rv = right[index] ?? 0
    if (lv > rv) return 1
    if (lv < rv) return -1
  }

  return 0
}

