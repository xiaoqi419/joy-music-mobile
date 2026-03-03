type RuntimeLogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface RuntimeLogEntry {
  id: number
  timestamp: number
  level: RuntimeLogLevel
  message: string
  meta?: string
}

interface RuntimeLogStats {
  total: number
  lastTimestamp: number | null
}

const MAX_LOG_COUNT = 1500
const listeners = new Set<() => void>()
const logEntries: RuntimeLogEntry[] = []

let logSeq = 0
let loggerInstalled = false
let globalErrorHookInstalled = false

function notifyListeners(): void {
  listeners.forEach((listener) => {
    try {
      listener()
    } catch {
      // ignore listener errors
    }
  })
}

function safeSerialize(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return String(value)
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`
  }
  if (depth > 3) return '[Object]'

  try {
    const cache = new WeakSet<object>()
    return JSON.stringify(value, (_key, nestedValue) => {
      if (typeof nestedValue === 'object' && nestedValue !== null) {
        if (cache.has(nestedValue)) return '[Circular]'
        cache.add(nestedValue)
      }
      if (nestedValue instanceof Error) {
        return {
          name: nestedValue.name,
          message: nestedValue.message,
          stack: nestedValue.stack,
        }
      }
      return nestedValue
    })
  } catch {
    try {
      return String(value)
    } catch {
      return '[Unserializable]'
    }
  }
}

function normalizeArgs(args: unknown[]): { message: string; meta?: string } {
  if (!args.length) return { message: '' }
  const [first, ...rest] = args
  const message = safeSerialize(first)
  if (!rest.length) return { message }
  const meta = rest.map((item) => safeSerialize(item)).join(' | ')
  return { message, meta }
}

function appendEntry(entry: RuntimeLogEntry): void {
  logEntries.push(entry)
  if (logEntries.length > MAX_LOG_COUNT) {
    logEntries.splice(0, logEntries.length - MAX_LOG_COUNT)
  }
  notifyListeners()
}

/**
 * 写入运行日志。用于业务代码主动上报关键节点。
 */
export function appendRuntimeLog(level: RuntimeLogLevel, message: string, meta?: unknown): void {
  const normalizedMeta = meta === undefined ? undefined : safeSerialize(meta)
  appendEntry({
    id: ++logSeq,
    timestamp: Date.now(),
    level,
    message: String(message || ''),
    meta: normalizedMeta,
  })
}

function installGlobalErrorHook(): void {
  if (globalErrorHookInstalled) return
  try {
    const globalAny = globalThis as { ErrorUtils?: any }
    const errorUtils = globalAny.ErrorUtils
    if (!errorUtils || typeof errorUtils.getGlobalHandler !== 'function' || typeof errorUtils.setGlobalHandler !== 'function') {
      return
    }

    const previousHandler = errorUtils.getGlobalHandler()
    errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      appendRuntimeLog('error', isFatal ? '[JS Fatal Error]' : '[JS Error]', error)
      if (typeof previousHandler === 'function') {
        previousHandler(error, isFatal)
      }
    })
    globalErrorHookInstalled = true
  } catch {
    // ignore global error hook failure
  }
}

/**
 * 安装全局日志采集（console + JS 全局异常）。
 */
export function installRuntimeLogger(): void {
  if (loggerInstalled) return
  loggerInstalled = true

  const originalLog = console.log.bind(console)
  const originalInfo = console.info.bind(console)
  const originalWarn = console.warn.bind(console)
  const originalError = console.error.bind(console)

  // 生产环境只采集 warn/error，跳过 debug/info 的序列化和存储开销。
  // 业务代码直接调用 appendRuntimeLog() 不受此限制。
  const captureVerbose = typeof __DEV__ !== 'undefined' ? __DEV__ : true

  console.log = (...args: unknown[]) => {
    if (captureVerbose) {
      const { message, meta } = normalizeArgs(args)
      appendRuntimeLog('debug', message, meta)
    }
    originalLog(...args)
  }

  console.info = (...args: unknown[]) => {
    if (captureVerbose) {
      const { message, meta } = normalizeArgs(args)
      appendRuntimeLog('info', message, meta)
    }
    originalInfo(...args)
  }

  console.warn = (...args: unknown[]) => {
    const { message, meta } = normalizeArgs(args)
    appendRuntimeLog('warn', message, meta)
    originalWarn(...args)
  }

  console.error = (...args: unknown[]) => {
    const { message, meta } = normalizeArgs(args)
    appendRuntimeLog('error', message, meta)
    originalError(...args)
  }

  installGlobalErrorHook()
  appendRuntimeLog('info', '[RuntimeLogger] installed')
}

export function getRuntimeLogStats(): RuntimeLogStats {
  const last = logEntries.length ? logEntries[logEntries.length - 1] : null
  return {
    total: logEntries.length,
    lastTimestamp: last?.timestamp ?? null,
  }
}

export function getRuntimeLogEntries(limit = 200): RuntimeLogEntry[] {
  const safeLimit = Math.max(1, Math.min(limit, MAX_LOG_COUNT))
  if (logEntries.length <= safeLimit) return [...logEntries]
  return logEntries.slice(logEntries.length - safeLimit)
}

export function clearRuntimeLogs(): void {
  logEntries.length = 0
  notifyListeners()
}

export function subscribeRuntimeLogs(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}.${ms}`
}

export function formatRuntimeLogsForExport(limit = MAX_LOG_COUNT): string {
  const entries = getRuntimeLogEntries(limit)
  const header = [
    '=== Joy Music Runtime Logs ===',
    `generatedAt=${new Date().toISOString()}`,
    `total=${entries.length}`,
    '',
  ]
  const body = entries.map((entry) => {
    const base = `[${formatTime(entry.timestamp)}] [${entry.level.toUpperCase()}] ${entry.message}`
    return entry.meta ? `${base}\n  meta: ${entry.meta}` : base
  })
  return [...header, ...body].join('\n')
}

