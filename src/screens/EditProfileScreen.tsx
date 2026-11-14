import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar, GradientButton, ScreenHeader } from '../components/ui';
import type {
  ProfilePhotoInput,
  ProfileSaveInput,
  ProfileSaveResult,
} from '../services/account';
import { useTheme, useThemeColors } from '../themeContext';
import { FAB_CLEARANCE, radius, type } from '../theme';

// Changing the login itself: name, profile photo and email address in one
// form. No password is ever asked for here — Supabase's recovery email (the
// "Reset password" row on Profile) is the only path to a new password, so
// this screen never handles one. A changed email that the project wants
// confirmed first is reported as pending: the form stays open and says so
// instead of pretending the address already switched.
export function EditProfileScreen({
  name,
  email,
  avatarUrl,
  onBack,
  onSave,
}: {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  onBack: () => void;
  onSave: (input: ProfileSaveInput) => Promise<ProfileSaveResult>;
}) {
  const { mode } = useTheme();
  const c = useThemeColors();
  const isDark = mode === 'dark';
  const tone = isDark ? ('dark' as const) : ('light' as const);

  const [nameText, setNameText] = useState(name ?? '');
  const [emailText, setEmailText] = useState(email ?? '');
  const [picked, setPicked] = useState<ProfilePhotoInput | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // What the preview shows: a just-picked photo wins, a removal falls back to
  // the initial letter, otherwise the photo already on the account.
  const previewUri = picked ? picked.uri : removePhoto ? null : avatarUrl;
  const dirty =
    nameText.trim() !== (name ?? '').trim() ||
    emailText.trim().toLowerCase() !== (email ?? '').trim().toLowerCase() ||
    Boolean(picked) ||
    (removePhoto && Boolean(avatarUrl));

  const choosePhoto = async (): Promise<void> => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        exif: false,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (asset) {
        setPicked({ uri: asset.uri, mime: asset.mimeType ?? 'image/jpeg' });
        setRemovePhoto(false);
        setError(null);
      }
    } catch {
      setError('Could not open the photo picker. Please try again.');
    }
  };

  const save = async (): Promise<void> => {
    if (saving) return;
    setError(null);
    setInfo(null);
    const nextEmail = emailText.trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (nameText.trim().length > 80) {
      setError('Name must be 80 characters or fewer.');
      return;
    }
    setSaving(true);
    try {
      const result = await onSave({
        name: nameText.trim() || null,
        email: nextEmail || (email ?? ''),
        currentEmail: email,
        photo: picked,
        // A new pick replaces whatever is stored, so a removal alongside it
        // would contradict the upload.
        removePhoto: picked ? false : removePhoto,
        currentAvatarUrl: avatarUrl,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.emailPending) {
        setInfo(
          `Check ${nextEmail} to confirm the change. Your name and photo are saved — the email switches once you click the link in that message.`,
        );
        return;
      }
      onBack();
    } finally {
      setSaving(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: c.darkBg },
        content: {
          paddingHorizontal: 18,
          paddingTop: 8,
          paddingBottom: FAB_CLEARANCE,
          gap: 16,
        },

        photoCard: {
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.md + 2,
          paddingVertical: 18,
          alignItems: 'center',
          gap: 12,
          marginTop: 6,
        },
        photoHint: { ...type.small, color: c.onDarkDim },
        photoActions: { flexDirection: 'row', gap: 10 },
        photoAction: {
          paddingHorizontal: 16,
          paddingVertical: 9,
          borderRadius: radius.pill,
          borderWidth: 1.5,
          borderColor: c.darkBorder,
        },
        photoActionPrimary: { borderColor: c.primarySoft, backgroundColor: c.primarySoft },
        photoActionLabel: { ...type.small, color: c.onDark, fontWeight: '700' },
        photoActionPrimaryLabel: { color: c.primary },

        formCard: {
          backgroundColor: c.darkCard,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: radius.md + 2,
          padding: 16,
          gap: 7,
        },
        label: {
          ...type.small,
          color: c.onDarkSub,
          fontWeight: '700',
          marginTop: 8,
        },
        field: {
          backgroundColor: c.darkCard2,
          borderWidth: 1,
          borderColor: c.darkBorder,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 12,
          color: c.onDark,
          ...type.body,
          lineHeight: 20,
        },
        fieldDisabled: { opacity: 0.6 },

        error: {
          ...type.small,
          color: '#FFB4B4',
          backgroundColor: 'rgba(255,82,82,0.14)',
          borderWidth: 1,
          borderColor: 'rgba(255,82,82,0.3)',
          borderRadius: radius.sm,
          padding: 11,
          lineHeight: 18,
        },
        info: {
          ...type.small,
          color: c.green,
          backgroundColor: c.greenSoft,
          borderWidth: 1,
          borderColor: c.green,
          borderRadius: radius.sm,
          padding: 11,
          lineHeight: 18,
        },
        note: {
          ...type.small,
          color: c.onDarkDim,
          textAlign: 'center',
          lineHeight: 18,
          paddingHorizontal: 6,
        },
        submit: { borderRadius: 14, overflow: 'hidden' },
      }),
    [c],
  );

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[c.darkBg, c.darkBg2, c.darkBg3]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Edit Profile" onBack={onBack} tone={tone} />

        <View style={styles.photoCard}>
          <Avatar uri={previewUri} name={nameText || email} size={96} dark={isDark} />
          <View style={styles.photoActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose a new profile photo"
              onPress={() => void choosePhoto()}
              disabled={saving}
              style={({ pressed }) => [
                styles.photoAction,
                styles.photoActionPrimary,
                (pressed || saving) && { opacity: 0.75 },
              ]}
            >
              <Text style={[styles.photoActionLabel, styles.photoActionPrimaryLabel]}>
                Change photo
              </Text>
            </Pressable>
            {avatarUrl && !removePhoto && !picked ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove the profile photo"
                onPress={() => {
                  setRemovePhoto(true);
                  setError(null);
                }}
                disabled={saving}
                style={({ pressed }) => [
                  styles.photoAction,
                  (pressed || saving) && { opacity: 0.75 },
                ]}
              >
                <Text style={styles.photoActionLabel}>Remove photo</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.photoHint}>JPG, PNG or WebP · up to 8 MB</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.field}
            value={nameText}
            onChangeText={setNameText}
            placeholder="Your name"
            placeholderTextColor={c.onDarkDim}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={80}
            editable={!saving}
          />
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.field, saving && styles.fieldDisabled]}
            value={emailText}
            onChangeText={setEmailText}
            placeholder="you@example.com"
            placeholderTextColor={c.onDarkDim}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving}
          />
        </View>

        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        {info ? <Text style={styles.info}>{info}</Text> : null}

        <GradientButton
          label={saving ? 'Saving…' : 'Save changes'}
          onPress={() => void save()}
          disabled={!dirty || saving}
          loading={saving}
          style={styles.submit}
        />

        <Text style={styles.note}>
          Your password is never changed from this form — use Reset password on Profile to get a
          secure reset link by email.
        </Text>
      </ScrollView>
    </View>
  );
}
