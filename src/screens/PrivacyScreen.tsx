import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ListRow, ScreenHeader } from '../components/ui';
import { DocIcon, MailIcon } from '../components/icons';
import { SUPPORT_EMAIL } from '../lib/helpContent';
import { PRIVACY_EFFECTIVE_DATE, PRIVACY_SECTIONS } from '../lib/privacyContent';
import { useTheme, useThemeColors } from '../themeContext';
import { FAB_CLEARANCE, radius, type } from '../theme';

/**
 * Privacy Policy. Rendered from `src/lib/privacyContent.ts` so the same text
 * ships in the app and can be linked from a store listing at `/privacy`.
 */
export function PrivacyScreen({ onBack }: { onBack: () => void }) {
  const { mode } = useTheme();
  const c = useThemeColors();
  const isDark = mode === 'dark';
  const tone = isDark ? ('dark' as const) : ('light' as const);
  const iconColor = isDark ? '#9E8CFF' : c.primary;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: c.darkBg },
        content: {
          paddingHorizontal: 18,
          paddingTop: 8,
          paddingBottom: FAB_CLEARANCE,
          gap: 8,
        },
        introCard: {
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.md + 2,
          padding: 16,
          gap: 6,
        },
        introText: { ...type.small, color: c.onDarkSub, lineHeight: 19 },
        sectionCard: {
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.md + 2,
          padding: 16,
          gap: 10,
        },
        heading: { ...type.h4, color: c.onDark, fontSize: 16 },
        paragraph: { ...type.small, color: c.onDarkSub, fontSize: 13.5, lineHeight: 20 },
        bulletRow: { flexDirection: 'row', gap: 9 },
        bulletDot: { color: c.primary, fontSize: 13.5, fontWeight: '800', lineHeight: 20 },
        bulletText: { ...type.small, color: c.onDarkSub, fontSize: 13.5, lineHeight: 20, flex: 1 },
        contactCard: {
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.md + 2,
          paddingHorizontal: 16,
        },
        contactNote: {
          ...type.small,
          color: c.onDarkDim,
          fontSize: 11.5,
          lineHeight: 17,
          marginTop: 8,
          marginHorizontal: 4,
        },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.darkBorder },
      }),
    [c],
  );

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[c.darkBg, c.darkBg2, c.darkBg3]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Privacy Policy" onBack={onBack} tone={tone} />

        <View style={styles.introCard}>
          <Text style={styles.introText}>
            Effective {PRIVACY_EFFECTIVE_DATE}. This policy covers the CreatorDNA app on web and
            mobile. It is written to be read — if anything is unclear, email us and we will
            explain it.
          </Text>
        </View>

        {PRIVACY_SECTIONS.map((section) => (
          <View key={section.id} style={styles.sectionCard}>
            <Text style={styles.heading}>{section.heading}</Text>
            {section.blocks.map((block, index) =>
              block.kind === 'p' ? (
                <Text key={index} style={styles.paragraph}>
                  {block.text}
                </Text>
              ) : (
                <View key={index} style={{ gap: 7 }}>
                  {block.items.map((item, itemIndex) => (
                    <View key={itemIndex} style={styles.bulletRow}>
                      <Text style={styles.bulletDot}>•</Text>
                      <Text style={styles.bulletText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ),
            )}
          </View>
        ))}

        <View style={styles.contactCard}>
          <ListRow
            tone={tone}
            icon={<MailIcon size={19} color={iconColor} />}
            label="Email privacy requests"
            value={SUPPORT_EMAIL}
            onPress={() => {
              // The address also appears as the row value, so it stays
              // readable when no mail client is configured on this device.
              void Linking.openURL(
                `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('CreatorDNA privacy request')}`,
              ).catch(() => {});
            }}
          />
          <View style={styles.divider} />
          <ListRow
            tone={tone}
            icon={<DocIcon size={19} color={iconColor} />}
            label="Data stored on this device"
            value="Erase in Settings"
          />
        </View>
        <Text style={styles.contactNote}>
          Analyses, ideas and chat live on this device. Instagram tokens are encrypted on our
          server and are never sent to the app.
        </Text>
      </ScrollView>
    </View>
  );
}
