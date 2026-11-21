import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';

const MIN = 12;
const MAX = 60;
const THUMB = 24;

/** Previews while dragging and saves only when the gesture finishes. */
export function LineSpacingSlider({ value, onCommit, onPreview, label, unit, color, muted, accent, disabled = false }: {
  value: number; onCommit: (value: number) => void; onPreview?: (value: number) => void;
  label: string; unit: string; color: string; muted: string; accent: string; disabled?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const [preview, setPreview] = useState(value);
  const latest = useRef({width, value, preview, onCommit, onPreview, disabled});
  latest.current = {width, value, preview, onCommit, onPreview, disabled};
  const start = useRef(0);
  const initialValue = useRef(value);
  useEffect(() => { setPreview(value); }, [value]);
  const choose = (x: number) => {
    const fraction = Math.max(0, Math.min(1, (x - THUMB / 2) / Math.max(1, latest.current.width - THUMB)));
    const next = Math.round(MIN + fraction * (MAX - MIN));
    latest.current.preview = next;
    setPreview(next);
    latest.current.onPreview?.(next);
  };
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !latest.current.disabled,
    onMoveShouldSetPanResponder: () => !latest.current.disabled,
    onPanResponderGrant: event => { initialValue.current = latest.current.value; start.current = event.nativeEvent.locationX; choose(start.current); },
    onPanResponderMove: (_event, gesture) => choose(start.current + gesture.dx),
    onPanResponderRelease: () => latest.current.onCommit(latest.current.preview),
    onPanResponderTerminate: () => { setPreview(initialValue.current); latest.current.onPreview?.(initialValue.current); },
  }), []);
  const fraction = (preview - MIN) / (MAX - MIN);
  return <View>
    <View style={styles.labelRow}>
      <Text style={{color}}>{label}</Text>
      <Text style={{color: muted}}>{preview} {unit}</Text>
    </View>
    <View accessible accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityValue={{min: MIN, max: MAX, now: preview, text: `${preview} ${unit}`}}
      accessibilityState={{disabled}} accessibilityActions={[{name: 'increment'}, {name: 'decrement'}]}
      onAccessibilityAction={({nativeEvent}) => {
        if (disabled || !['increment', 'decrement'].includes(nativeEvent.actionName)) return;
        const next = Math.max(MIN, Math.min(MAX, preview + (nativeEvent.actionName === 'increment' ? 1 : -1)));
        setPreview(next); onPreview?.(next); onCommit(next);
      }}
      testID="line-spacing-slider" onLayout={event => setWidth(event.nativeEvent.layout.width)}
      {...pan.panHandlers} style={styles.touch}>
      <View pointerEvents="none" style={[styles.track, {backgroundColor: muted}]} />
      <View pointerEvents="none" style={[styles.fill, {width: Math.max(0, (width - THUMB) * fraction), backgroundColor: accent}]} />
      <View pointerEvents="none" style={[styles.thumb, {left: Math.max(0, (width - THUMB) * fraction), backgroundColor: accent}]} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  labelRow: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 12},
  touch: {height: 44, justifyContent: 'center'},
  track: {position: 'absolute', left: THUMB / 2, right: THUMB / 2, height: 4, borderRadius: 2, opacity: 0.35},
  fill: {position: 'absolute', left: THUMB / 2, height: 4, borderRadius: 2},
  thumb: {position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2},
});
