import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { GradientButton } from './ui';
import { useThemeColors, useStyles } from '../themeContext';
import { radius, type } from '../theme';
import {
  currentUserIdFromToken,
  validateDisplayName,
  validateHandle,
  validateNiche,
  type CreatorProfile,
} from '../lib/community/model';
import * as community from '../services/community';

/**
 * The community identity card — where a creator picks the handle their posts
 * and Top Creators row are shown under.
 *
 * It used to sit at the top of the Community feed, where it pushed the actual
 * feed below the fold for anyone who had not joined yet. It lives in Profile
 * now: the feed is for reading and posting, identity is set once, here.
 *
 * Loading an existing profile renders it read-only with an "Edit" action, so
 * returning creators are not asked to re-enter a handle they already own.
 */
export function CommunityHandleCard({
  getCreatorToken,
  onSaved,
}: {
  getCreatorToken: () => Promise<string>;
  /** Fires after a successful save so the parent can refresh its own copy. */
  onSaved?: (profile: CreatorProfile) => void;
}) {
  const c = useThemeColors();
  const s = useStyles(makeStyles);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const [loaded, setLoaded] = useState(false);
  const [existing, setExisting] = useState<CreatorProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ handle: '', name: '', niche: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getCreatorToken();
      const me = currentUserIdFromToken(token);
      const result = await community.listProfiles(token, me ? { userId: me, limit: 1 } : { limit: 1 });
      if (!alive.current) return;
      const profile = result.ok ? (result.data.items[0] ?? null) : null;
      setExisting(profile);
      if (profile) {
        setDraft({
          handle: profile.handle,
          name: profile.displayName,
          niche: profile.niche,
        });
      }
    } catch {
      /* no profile is a valid answer — the form simply stays open */
    } finally {
      if (alive.current) setLoaded(true);
    }
  }, [getCreatorToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(async () => {
    const handle = validateHandle(draft.handle);
    if (!handle.ok) {
      setError(handle.error);
      return;
    }
    const name = validateDisplayName(draft.name);
    if (!name.ok) {
      setError(name.error);
      return;
    }
    const niche = validateNiche(draft.niche);
    if (!niche.ok) {
      setError(niche.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = await getCreatorToken();
      const result = await community.saveProfile(token, {
        handle: handle.value,
        displayName: name.value,
        niche: niche.value,
      });
      if (!alive.current) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setExisting(result.data);
      setEditing(false);
      onSaved?.(result.data);
    } catch {
      if (alive.current) setError('Your profile could not be saved. Please retry.');
    } finally {
      if (alive.current) setSaving(false);
    }
  }, [draft, getCreatorToken, onSaved]);

  if (!loaded) {
    return (
      <View style={s.card}>
        <Text style={s.title}>Community handle</Text>
        <Text style={s.hint}>Checking your community profile…</Text>
      </View>
    );
  }

  if (existing && !editing) {
    return (
      <View style={s.card}>
        <Text style={s.title}>Community handle</Text>
        <Text style={s.value}>@{existing.handle}</Text>
        <Text style={s.hint}>
          Shown on your posts in Community{existing.isListed ? ' and on Top Creators if your Instagram is connected' : ''}.
        </Text>
        <Pressable
          onPress={() => {
            setError(null);
            setEditing(true);
          }}
          style={s.edit}
          accessibilityRole="button"
          accessibilityLabel="Edit community handle"
        >
          <Text style={s.editLabel}>Edit</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.card}>
      {/* The heading never changes so the section reads as one place — you
          chose your handle here, and you come back here to change it. */}
      <Text style={s.title}>Community handle</Text>
      <Text style={s.hint}>
        {existing
          ? 'Editing — other creators see this on everything you post.'
          : 'Other creators see this on everything you post. Pick it once — you can change it later.'}
      </Text>

      <Text style={s.label}>Handle</Text>
      <TextInput
        value={draft.handle}
        onChangeText={(next) => setDraft((d) => ({ ...d, handle: next }))}
        placeholder="yourhandle"
        placeholderTextColor={c.onDarkDim}
        autoCapitalize="none"
        autoCorrect={false}
        style={s.input}
        accessibilityLabel="Creator handle"
      />

      <Text style={s.label}>Display name</Text>
      <TextInput
        value={draft.name}
        onChangeText={(next) => setDraft((d) => ({ ...d, name: next }))}
        placeholder="Your name"
        placeholderTextColor={c.onDarkDim}
        style={s.input}
        accessibilityLabel="Display name"
      />

      <Text style={s.label}>Niche (optional)</Text>
      <TextInput
        value={draft.niche}
        onChangeText={(next) => setDraft((d) => ({ ...d, niche: next }))}
        placeholder="e.g. fitness, food, tech"
        placeholderTextColor={c.onDarkDim}
        style={s.input}
        accessibilityLabel="Niche"
      />

      {error ? <Text style={s.error}>{error}</Text> : null}

      <View style={s.actions}>
        {existing ? (
          <Pressable
            onPress={() => {
              setError(null);
              setEditing(false);
            }}
            style={s.cancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel editing"
          >
            <Text style={s.cancelLabel}>Cancel</Text>
          </Pressable>
        ) : null}
        <GradientButton
          label={saving ? 'Saving…' : existing ? 'Save handle' : 'Create my handle'}
          onPress={() => void submit()}
          loading={saving}
          disabled={saving}
          style={{ flexGrow: 1 }}
        />
      </View>
    </View>
  );
}

const makeStyles = (c: ReturnType<typeof useThemeColors>) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.darkCard,
      borderWidth: 1,
      borderColor: c.darkBorder,
      borderRadius: radius.md + 2,
      padding: 16,
      gap: 8,
    },
    title: { ...type.h4, color: c.onDark },
    value: { ...type.h3, color: c.primary },
    hint: { ...type.small, color: c.onDarkSub, lineHeight: 18 },
    label: { ...type.tiny, color: c.onDarkDim, letterSpacing: 0.6, textTransform: 'uppercase' },
    input: {
      backgroundColor: c.darkBg2,
      borderWidth: 1,
      borderColor: c.darkBorder,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 11,
      color: c.onDark,
      fontSize: 15,
    },
    error: { ...type.small, color: c.red, lineHeight: 18 },
    actions: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
    edit: {
      alignSelf: 'flex-start',
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: c.darkBorder,
      marginTop: 4,
    },
    editLabel: { ...type.small, fontWeight: '800', color: c.primary },
    cancel: {
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: c.darkBorder,
    },
    cancelLabel: { ...type.small, fontWeight: '700', color: c.onDarkSub },
  });
