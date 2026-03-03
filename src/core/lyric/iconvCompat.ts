/**
 * iconv-lite 兼容解码器（React Native 版）。
 * 仅复用 iconv-lite 的编码表与解码器，不加载其 stream API，
 * 避免 Metro 在移动端解析 `iconv-lite/lib/index.js` 时触发 ./streams 报错。
 */

type AnyObject = Record<string, any>

const DEFAULT_CHAR_UNICODE = '�'
const DEFAULT_CHAR_SINGLE_BYTE = '?'
let allEncodings: AnyObject | null = null
const codecCache: AnyObject = Object.create(null)

function mergeOwnProps(target: AnyObject, source: AnyObject): void {
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      target[key] = source[key]
    }
  }
}

function canonicalizeEncoding(encoding: string): string {
  return String(encoding || '')
    .toLowerCase()
    .replace(/:\d{4}$|[^0-9a-z]/g, '')
}

function ensureEncodings(): AnyObject {
  if (allEncodings) return allEncodings
  // 只加载编码表定义，不走 iconv-lite 主入口（主入口会尝试 stream API）。
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const raw = require('iconv-lite/encodings')
  const merged: AnyObject = Object.create(null)
  mergeOwnProps(merged, raw)
  allEncodings = merged
  return merged
}

function getCodec(encoding: string): any {
  const encodings = ensureEncodings()
  let enc = canonicalizeEncoding(encoding)
  const codecOptions: AnyObject = {}

  while (true) {
    const cached = codecCache[enc]
    if (cached) return cached

    const codecDef = encodings[enc]
    switch (typeof codecDef) {
      case 'string':
        enc = codecDef
        break
      case 'object':
        mergeOwnProps(codecOptions, codecDef)
        if (!codecOptions.encodingName) codecOptions.encodingName = enc
        enc = codecDef.type
        break
      case 'function': {
        if (!codecOptions.encodingName) codecOptions.encodingName = enc
        const iconvLike = {
          defaultCharUnicode: DEFAULT_CHAR_UNICODE,
          defaultCharSingleByte: DEFAULT_CHAR_SINGLE_BYTE,
        }
        const codec = new codecDef(codecOptions, iconvLike)
        codecCache[codecOptions.encodingName] = codec
        return codec
      }
      default:
        throw new Error(`Encoding not recognized: ${encoding}`)
    }
  }
}

function getDecoder(encoding: string, options?: AnyObject): any {
  const codec = getCodec(encoding)
  const decoder = new codec.decoder(options, codec)
  if (codec.bomAware && !(options && options.stripBOM === false)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const bomHandling = require('iconv-lite/lib/bom-handling')
    return new bomHandling.StripBOM(decoder, options)
  }
  return decoder
}

export function decodeByIconvCompat(
  bytes: Uint8Array,
  encoding: string
): string {
  const decoder = getDecoder(encoding)
  const result = decoder.write(bytes)
  const trail = decoder.end()
  return trail ? `${result}${trail}` : result
}

