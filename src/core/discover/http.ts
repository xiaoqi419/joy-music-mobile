type HttpMethod = 'GET' | 'POST'

interface HttpOptions {
  method?: HttpMethod
  query?: Record<string, string | number | boolean | null | undefined>
  headers?: Record<string, string>
  form?: Record<string, string | number | boolean | null | undefined>
  body?: unknown
  timeoutMs?: number
}

export interface HttpResponse<T = any> {
  status: number
  data: T
  url: string
}

function buildUrl(url: string, query?: HttpOptions['query']): string {
  if (!query) return url
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue
    searchParams.append(key, String(value))
  }
  const queryString = searchParams.toString()
  if (!queryString) return url
  return `${url}${url.includes('?') ? '&' : '?'}${queryString}`
}

export async function httpRequest<T = any>(
  url: string,
  options: HttpOptions = {}
): Promise<HttpResponse<T>> {
  const {
    method = 'GET',
    headers = {},
    form,
    body,
    timeoutMs = 15000,
    query,
  } = options

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const requestHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      ...headers,
    }

    const init: RequestInit = {
      method,
      headers: requestHeaders,
      signal: controller.signal,
    }

    if (form) {
      const formData = new URLSearchParams()
      for (const [key, value] of Object.entries(form)) {
        if (value === null || value === undefined) continue
        formData.append(key, String(value))
      }
      init.body = formData.toString()
      if (!requestHeaders['Content-Type']) {
        requestHeaders['Content-Type'] = 'application/x-www-form-urlencoded'
      }
    } else if (body !== undefined) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body)
      if (!requestHeaders['Content-Type']) {
        requestHeaders['Content-Type'] = 'application/json'
      }
    }

    const finalUrl = buildUrl(url, query)
    const resp = await fetch(finalUrl, init)
    const text = await resp.text()
    let data: any = text
    try {
      data = JSON.parse(text)
    } catch {
      // keep raw text
    }

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
    }

    return { status: resp.status, data, url: resp.url }
  } finally {
    clearTimeout(timer)
  }
}

export async function withRetry<T>(
  task: () => Promise<T>,
  retries = 2
): Promise<T> {
  let lastError: unknown
  for (let i = 0; i <= retries; i++) {
    try {
      return await task()
    } catch (err) {
      lastError = err
      if (i < retries) {
        await new Promise(resolve => setTimeout(resolve, 300 * (i + 1)))
      }
    }
  }
  throw lastError
}
