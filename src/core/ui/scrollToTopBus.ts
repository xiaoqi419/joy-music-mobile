type ScrollToTopHandler = () => void
type ScrollTopStateHandler = (isAtTop: boolean) => void

const handlers = new Set<ScrollToTopHandler>()
const stateHandlers = new Set<ScrollTopStateHandler>()
let latestIsAtTop = true

export function emitScrollToTop() {
  handlers.forEach((handler) => {
    try {
      handler()
    } catch (error) {
      console.warn('[scrollToTopBus] handler failed:', error)
    }
  })
}

export function subscribeScrollToTop(handler: ScrollToTopHandler): () => void {
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}

export function emitScrollTopState(isAtTop: boolean) {
  latestIsAtTop = isAtTop
  stateHandlers.forEach((handler) => {
    try {
      handler(isAtTop)
    } catch (error) {
      console.warn('[scrollToTopBus] state handler failed:', error)
    }
  })
}

export function subscribeScrollTopState(handler: ScrollTopStateHandler): () => void {
  stateHandlers.add(handler)
  handler(latestIsAtTop)
  return () => {
    stateHandlers.delete(handler)
  }
}
