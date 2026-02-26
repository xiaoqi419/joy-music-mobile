import { compareVersion, normalizeVersion } from '../../../src/core/update/version'

describe('version utils', () => {
  test('normalizeVersion supports v-prefix and missing segments', () => {
    expect(normalizeVersion('v1.2')).toBe('1.2.0')
    expect(normalizeVersion('1')).toBe('1.0.0')
    expect(normalizeVersion('')).toBe('0.0.0')
  })

  test('compareVersion compares semver-like versions correctly', () => {
    expect(compareVersion('1.0.0', '1.0.1')).toBeLessThan(0)
    expect(compareVersion('v1.2.3', '1.2.3')).toBe(0)
    expect(compareVersion('1.10.0', '1.9.9')).toBeGreaterThan(0)
  })
})
