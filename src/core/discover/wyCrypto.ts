/**
 * 网易云音乐 API 加密工具。
 * 实现 linuxapi 加密方式（AES-128-ECB），用于调用 WY 歌单/排行榜等接口。
 * 不使用 httpRequest 的 form 选项，直接构建请求体以避免 URLSearchParams 兼容性问题。
 */

import CryptoJS from 'crypto-js'
import type { HttpResponse } from './http'

/** linuxapi 加密密钥 */
const LINUX_API_KEY = CryptoJS.enc.Utf8.parse('rFgB&h#%2?^eDg:Q')

/**
 * 使用 linuxapi 方式加密请求数据。
 * @param data - 需要加密的原始请求对象
 * @returns 加密后的 eparams 十六进制字符串
 */
function linuxapiEncrypt(data: object): string {
  const text = JSON.stringify(data)
  const encrypted = CryptoJS.AES.encrypt(text, LINUX_API_KEY, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  })
  return encrypted.ciphertext.toString(CryptoJS.enc.Hex).toUpperCase()
}

/**
 * 通过 linuxapi 加密通道发送 WY API 请求。
 * 绕过 httpRequest 的 form/URLSearchParams，直接使用 fetch 发送请求体。
 * @param url - 目标 API 地址（如 https://music.163.com/api/playlist/list）
 * @param params - 请求参数
 * @returns HTTP 响应
 */
export async function wyRequest<T = any>(
  url: string,
  params: Record<string, any> = {}
): Promise<HttpResponse<T>> {
  const eparams = linuxapiEncrypt({
    method: 'POST',
    url,
    params,
  })

  const body = `eparams=${eparams}`

  console.log('[wyCrypto] wyRequest ->', url, 'body length:', body.length)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)

  try {
    const resp = await fetch('https://music.163.com/api/linux/forward', {
      method: 'POST',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
        Referer: 'https://music.163.com',
        Cookie: 'os=pc; appver=2.10.6;',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: controller.signal,
    })

    const text = await resp.text()
    let data: any = text
    try {
      data = JSON.parse(text)
    } catch {
      // keep raw text
    }

    console.log('[wyCrypto] response status:', resp.status, 'body:', text.length < 500 ? text : text.substring(0, 500))

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
    }

    return { status: resp.status, data, url: resp.url }
  } finally {
    clearTimeout(timer)
  }
}
