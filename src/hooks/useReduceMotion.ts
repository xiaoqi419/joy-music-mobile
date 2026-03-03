import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

export default function useReduceMotion(): boolean {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    let active = true

    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setEnabled(value)
      })
      .catch(() => {
        if (active) setEnabled(false)
      })

    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) => {
      setEnabled(value)
    })

    return () => {
      active = false
      subscription?.remove?.()
    }
  }, [])

  return enabled
}
