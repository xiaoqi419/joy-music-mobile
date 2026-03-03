import * as Haptics from 'expo-haptics'

async function safeImpact(style: Haptics.ImpactFeedbackStyle) {
  try {
    await Haptics.impactAsync(style)
  } catch {
    // ignore haptics availability failures
  }
}

export async function triggerTabHaptic() {
  await safeImpact(Haptics.ImpactFeedbackStyle.Light)
}

export async function triggerPlaybackHaptic() {
  await safeImpact(Haptics.ImpactFeedbackStyle.Medium)
}

export async function triggerDestructiveHaptic() {
  await safeImpact(Haptics.ImpactFeedbackStyle.Heavy)
}

export async function triggerSelectionHaptic() {
  try {
    await Haptics.selectionAsync()
  } catch {
    // ignore haptics availability failures
  }
}
