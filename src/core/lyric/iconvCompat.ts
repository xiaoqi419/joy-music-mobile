/**
 * iconv-lite 兼容解码（React Native 版）
 * 仅加载 DBCS 子模块，避开 encodings/index -> internal.js 对 string_decoder 的依赖。
 */

type AnyObject = Record<string, any>

const DEFAULT_CHAR_UNICODE = '\uFFFD'
const DEFAULT_CHAR_SINGLE_BYTE = '?'
const DBCS_TYPE = '_dbcs'

let dbcsData: AnyObject | null = null
let DBCSCodecCtor: any = null
const codecCache: AnyObject = Object.create(null)

function canonicalizeEncoding(encoding: string): string {
  return String(encoding || '')
    .toLowerCase()
    .replace(/:\d{4}$|[^0-9a-z]/g, '')
}

function ensureDbcsModules(): { data: AnyObject; ctor: any } {
  if (!dbcsData || !DBCSCodecCtor) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dbcsCodecModule = require('iconv-lite/encodings/dbcs-codec')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const data = require('iconv-lite/encodings/dbcs-data')

    DBCSCodecCtor = dbcsCodecModule?._dbcs
    dbcsData = data
  }

  if (!dbcsData || typeof DBCSCodecCtor !== 'function') {
    throw new Error('Failed to initialize iconv dbcs codec modules')
  }

  return {
    data: dbcsData,
    ctor: DBCSCodecCtor,
  }
}

function resolveDbcsOptions(encoding: string): AnyObject {
  const { data } = ensureDbcsModules()
  let name = canonicalizeEncoding(encoding)
  let entry: any = data[name]

  while (typeof entry === 'string') {
    name = canonicalizeEncoding(entry)
    entry = data[name]
  }

  if (!entry || typeof entry !== 'object' || entry.type !== DBCS_TYPE) {
    throw new Error(`Encoding not recognized or unsupported in RN dbcs mode: ${encoding}`)
  }

  return {
    ...entry,
    encodingName: name,
  }
}

function getCodec(encoding: string): any {
  const cacheKey = canonicalizeEncoding(encoding)
  const cached = codecCache[cacheKey]
  if (cached) return cached

  const { ctor } = ensureDbcsModules()
  const options = resolveDbcsOptions(encoding)
  const iconvLike = {
    defaultCharUnicode: DEFAULT_CHAR_UNICODE,
    defaultCharSingleByte: DEFAULT_CHAR_SINGLE_BYTE,
  }
  const codec = new ctor(options, iconvLike)
  codecCache[cacheKey] = codec
  return codec
}

export function decodeByIconvCompat(bytes: Uint8Array, encoding: string): string {
  const codec = getCodec(encoding)
  const decoder = new codec.decoder(undefined, codec)
  const result = decoder.write(bytes)
  const trail = decoder.end()
  return trail ? `${result}${trail}` : result
}
