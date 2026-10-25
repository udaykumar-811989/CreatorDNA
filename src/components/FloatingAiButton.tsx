import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { storageKeys, usePersistentState } from '../lib/storage';
import { colors, NAV_HEIGHT } from '../theme';
import { SparkIcon } from './icons';

// Floating "chat with AI" button — the always-available entry to the
// whole-app CreatorDNA assistant. Draggable: press to open the chat,
// drag anywhere on screen to reposition (position is remembered locally).
const FAB_WIDTH = 56;
const FAB_HEIGHT = 78; // circle (56) + gap (4) + tag (~18)
const EDGE = 10;
const TAP_SLOP = 5; // movement under this many px still counts as a tap

type FabPosition = { left: number; top: number };

function clampPosition(
  position: FabPosition,
  width: number,
  height: number,
  bottomReserve: number,
): FabPosition {
  return {
    left: Math.min(Math.max(position.left, EDGE), Math.max(EDGE, width - FAB_WIDTH - EDGE)),
    top: Math.min(
      Math.max(position.top, EDGE),
      Math.max(EDGE, height - FAB_HEIGHT - bottomReserve),
    ),
  };
}

function defaultPosition(width: number, height: number, bottomReserve: number): FabPosition {
  return clampPosition(
    { left: width - 16 - FAB_WIDTH, top: height - (NAV_HEIGHT + 14) - FAB_HEIGHT },
    width,
    height,
    bottomReserve,
  );
}

export function FloatingAiButton({
  onPress,
  bottomReserve = NAV_HEIGHT + 12,
}: {
  onPress: () => void;
  bottomReserve?: number;
}) {
  const { width, height } = useWindowDimensions();
  const [stored, setStored] = usePersistentState<FabPosition | null>(
    storageKeys.fabPosition,
    null,
  );
  const [dragPosition, setDragPosition] = useState<FabPosition | null>(null);
  const [pressed, setPressed] = useState(false);

  const shown = dragPosition ?? clampPosition(
    stored ?? defaultPosition(width, height, bottomReserve),
    width,
    height,
    bottomReserve,
  );

  // Latest values for the long-lived PanResponder closures.
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const dimsRef = useRef({ width, height, bottomReserve });
  dimsRef.current = { width, height, bottomReserve };
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;

  const dragStart = useRef<FabPosition | null>(null);
  const moved = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
      onPanResponderGrant: () => {
        dragStart.current = shownRef.current;
        moved.current = false;
        setPressed(true);
      },
      onPanResponderMove: (_, gesture) => {
        const start = dragStart.current;
        if (!start) {
          return;
        }
        if (!moved.current && Math.hypot(gesture.dx, gesture.dy) > TAP_SLOP) {
          moved.current = true;
        }
        if (!moved.current) {
          return;
        }
        const { width: w, height: h, bottomReserve: reserve } = dimsRef.current;
        setDragPosition(
          clampPosition(
            { left: start.left + gesture.dx, top: start.top + gesture.dy },
            w,
            h,
            reserve,
          ),
        );
      },
      onPanResponderRelease: () => {
        setPressed(false);
        if (!moved.current) {
          // A tap (no real movement) opens the chat.
          setDragPosition(null);
          onPressRef.current();
          dragStart.current = null;
          return;
        }
        // A drag repositions the button and remembers the spot.
        setStored(shownRef.current);
        setDragPosition(null);
        dragStart.current = null;
      },
      onPanResponderTerminate: () => {
        setPressed(false);
        setDragPosition(null);
        dragStart.current = null;
      },
    }),
  ).current;

  return (
    <View
      accessibilityRole="button"
      accessibilityLabel="Chat with CreatorDNA AI"
      accessibilityHint="Opens the AI chat. Drag to move this button anywhere on the screen."
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'activate') {
          onPressRef.current();
        }
      }}
      {...panResponder.panHandlers}
      style={[styles.fab, { left: shown.left, top: shown.top }]}
    >
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.fill, pressed && { transform: [{ scale: 0.96 }], opacity: 0.92 }]}
      >
        <SparkIcon size={24} color="#FFFFFF" />
      </LinearGradient>
      <Text style={styles.tag}>Ask AI</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    alignItems: 'center',
    gap: 4,
    zIndex: 20,
  },
  fill: {
    width: FAB_WIDTH,
    height: FAB_WIDTH,
    borderRadius: FAB_WIDTH / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1A56AE',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  tag: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
    backgroundColor: colors.white,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
