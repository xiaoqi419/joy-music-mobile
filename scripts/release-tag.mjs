#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const VERSION_REG = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

function parseArgValue(argv, name) {
  const key = `--${name}`
  const index = argv.indexOf(key)
  if (index >= 0 && argv[index + 1]) return argv[index + 1]
  return ''
}

function replaceWithCheck(source, matcher, replacer, filePath, label) {
  if (!matcher.test(source)) {
    throw new Error(`无法在 ${filePath} 中定位 ${label}`)
  }
  return source.replace(matcher, replacer)
}

function updateConfigVersion(filePath, version) {
  const source = fs.readFileSync(filePath, 'utf8')
  const matcher = /version:\s*'[^']*'/
  const updated = replaceWithCheck(source, matcher, `version: '${version}'`, filePath, 'version 字段')
  if (updated !== source) {
    fs.writeFileSync(filePath, updated, 'utf8')
  }
}

function updatePackageVersion(filePath, version) {
  const source = fs.readFileSync(filePath, 'utf8')
  const matcher = /("version"\s*:\s*")[^"]*(")/
  const updated = replaceWithCheck(source, matcher, `$1${version}$2`, filePath, 'version 字段')
  if (updated !== source) {
    fs.writeFileSync(filePath, updated, 'utf8')
  }
}

function updateAppVersions(filePath, version) {
  const source = fs.readFileSync(filePath, 'utf8')
  const expoVersionMatcher = /("version"\s*:\s*")[^"]*(")/
  const buildNumberMatcher = /("buildNumber"\s*:\s*")[^"]*(")/
  let updated = replaceWithCheck(source, expoVersionMatcher, `$1${version}$2`, filePath, 'expo.version 字段')
  updated = replaceWithCheck(updated, buildNumberMatcher, `$1${version}$2`, filePath, 'ios.buildNumber 字段')
  if (updated !== source) {
    fs.writeFileSync(filePath, updated, 'utf8')
  }
}

function main() {
  const args = process.argv.slice(2)
  const fromFlag = parseArgValue(args, 'version')
  const fromPositional = args.find((arg) => !arg.startsWith('-')) || ''
  const version = String(fromFlag || fromPositional || '').trim()

  if (!VERSION_REG.test(version)) {
    throw new Error('版本号格式无效，请使用 1.2.3 或 1.2.3-beta.1')
  }

  const root = process.cwd()
  const packageJsonPath = path.join(root, 'package.json')
  const appJsonPath = path.join(root, 'app.json')
  const configPath = path.join(root, 'src/config/index.ts')

  updatePackageVersion(packageJsonPath, version)
  // 统一把 app.json 的 version/buildNumber 与发版号对齐，便于发布追踪。
  updateAppVersions(appJsonPath, version)
  // 同步应用内“当前版本”显示字段，避免检查更新时版本漂移。
  updateConfigVersion(configPath, version)

  const tagName = `v${version}`
  console.log(`Updated version files to ${version}`)
  console.log(`Next tag: ${tagName}`)
  console.log('Touched files:')
  console.log('- package.json')
  console.log('- app.json')
  console.log('- src/config/index.ts')
}

main()
