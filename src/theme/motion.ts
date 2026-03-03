export interface MotionTokens {
  duration: {
    quick: number
    base: number
    emphasis: number
    immersive: number
  }
  spring: {
    tab: {
      damping: number
      stiffness: number
      mass: number
    }
    card: {
      damping: number
      stiffness: number
      mass: number
    }
    gesture: {
      damping: number
      stiffness: number
      mass: number
    }
  }
}

export const motion: MotionTokens = {
  duration: {
    quick: 140,
    base: 220,
    emphasis: 360,
    immersive: 520,
  },
  spring: {
    tab: {
      damping: 18,
      stiffness: 220,
      mass: 0.9,
    },
    card: {
      damping: 18,
      stiffness: 220,
      mass: 0.9,
    },
    gesture: {
      damping: 20,
      stiffness: 260,
      mass: 0.9,
    },
  },
}
