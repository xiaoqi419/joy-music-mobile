import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  LayoutChangeEvent,
} from 'react-native';
import Slider from '@react-native-community/slider';

interface CircleSliderProps {
  progress: number; // 0 to 1
  onSlidingStart?: () => void;
  onSlidingComplete?: (progress: number) => void;
  onValueChange?: (progress: number) => void;
  accentColor: string;
  trackColor: string;
}

const THUMB_SIZE = 12;

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export default function CircleSlider({
  progress,
  onSlidingStart,
  onSlidingComplete,
  onValueChange,
  accentColor,
  trackColor,
}: CircleSliderProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [internalProgress, setInternalProgress] = useState(clampProgress(progress));
  const isDragging = useRef(false);

  useEffect(() => {
    if (!isDragging.current) {
      setInternalProgress(clampProgress(progress));
    }
  }, [progress]);

  const updateProgress = useCallback((value: number) => {
    const nextProgress = clampProgress(value);
    setInternalProgress(nextProgress);
    onValueChange?.(nextProgress);
    return nextProgress;
  }, [onValueChange]);

  const handleSlidingStart = useCallback((value: number) => {
    isDragging.current = true;
    updateProgress(value);
    onSlidingStart?.();
  }, [onSlidingStart, updateProgress]);

  const handleSlidingComplete = useCallback((value: number) => {
    const nextProgress = updateProgress(value);
    isDragging.current = false;
    onSlidingComplete?.(nextProgress);
  }, [onSlidingComplete, updateProgress]);

  const handleLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  };
  const fillWidth = `${internalProgress * 100}%`;
  const thumbOffset = containerWidth > 0
    ? Math.max(0, Math.min(containerWidth - THUMB_SIZE, internalProgress * containerWidth - THUMB_SIZE / 2))
    : 0;

  return (
    <View
      style={styles.container}
      onLayout={handleLayout}
    >
      <View style={styles.hitArea} pointerEvents="none">
        <View style={[styles.trackBg, { backgroundColor: trackColor }]}>
          <View style={[styles.trackFill, { width: fillWidth, backgroundColor: accentColor }]} />
        </View>
        <View
          style={[
            styles.thumb,
            {
              backgroundColor: accentColor,
              left: thumbOffset,
            }
          ]}
        />
      </View>
      <Slider
        style={styles.nativeSlider}
        minimumValue={0}
        maximumValue={1}
        step={0}
        value={internalProgress}
        onSlidingStart={handleSlidingStart}
        onValueChange={updateProgress}
        onSlidingComplete={handleSlidingComplete}
        minimumTrackTintColor="transparent"
        maximumTrackTintColor="transparent"
        thumbTintColor="transparent"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 36,
    justifyContent: 'center',
  },
  hitArea: {
    height: 36,
    justifyContent: 'center',
    width: '100%',
    position: 'relative',
  },
  trackBg: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    top: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  nativeSlider: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: 36,
    opacity: 0.02,
  },
});
