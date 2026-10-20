import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, NAV_HEIGHT } from '../theme';
import { SparkIcon } from './icons';

// Floating "chat with AI" button — the always-available entry to the
// whole-app CreatorDNA assistant. Sits above the bottom navigation.
export function FloatingAiButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Chat with CreatorDNA AI"
      onPress={onPress}
      style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.96 }], opacity: 0.92 }]}
    >
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.fill}
      >
        <SparkIcon size={24} color="#FFFFFF" />
      </LinearGradient>
      <Text style={styles.tag}>Ask AI</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    bottom: NAV_HEIGHT + 14,
    alignItems: 'center',
    gap: 4,
    zIndex: 20,
  },
  fill: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6C5CE7',
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
