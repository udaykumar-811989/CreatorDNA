import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  validateReportDetails,
  type ReportReason,
} from '../lib/community/model';
import { radius, type } from '../theme';
import { useThemeColors } from '../themeContext';
import { GradientButton } from './ui';

/**
 * The one place a report is written down.
 *
 * A report is a note to a moderator, never an automatic takedown, so the copy
 * says that plainly — nobody should fear that tapping Report will silence a
 * creator they simply disagree with. Reasons mirror the server's list exactly;
 * the server still checks them, because a client check is a suggestion.
 */
export type ReportSheetProps = {
  visible: boolean;
  /** What is being reported, for the heading: "this update", "this comment"… */
  targetLabel: string;
  onCancel: () => void;
  /**
   * Files the report. Returns an error message to show, or null on success —
   * the sheet closes itself when the caller resolves with null.
   */
  onSubmit: (reason: ReportReason, details: string) => Promise<string | null>;
};

export function ReportSheet({ visible, targetLabel, onCancel, onSubmit }: ReportSheetProps) {
  const c = useThemeColors();
  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fresh form each time it opens: a stale reason from a previous report
  // would be filed by accident.
  useEffect(() => {
    if (visible) {
      setReason('spam');
      setDetails('');
      setError(null);
      setBusy(false);
    }
  }, [visible]);

  const submit = async () => {
    const checked = validateReportDetails(details);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const failure = await onSubmit(reason, checked.value);
      if (failure) setError(failure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={[s.sheet, { backgroundColor: c.darkCard, borderColor: c.darkBorder }]}>
          <Text style={[s.title, { color: c.onDark }]}>Report {targetLabel}</Text>
          <Text style={[s.lede, { color: c.onDarkSub }]}>
            A moderator reviews reports. Nothing is hidden automatically, and your name is never
            shown to the creator you report.
          </Text>

          <View style={s.reasons} accessibilityRole="radiogroup" accessibilityLabel="Report reason">
            {REPORT_REASONS.map((entry) => {
              const active = entry === reason;
              return (
                <Pressable
                  key={entry}
                  onPress={() => setReason(entry)}
                  disabled={busy}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={REPORT_REASON_LABELS[entry]}
                  style={[
                    s.reason,
                    {
                      backgroundColor: active ? c.primarySoft : c.darkCard2,
                      borderColor: active ? c.primary : c.darkBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.reasonLabel,
                      { color: active ? c.primary : c.onDarkSub },
                    ]}
                  >
                    {REPORT_REASON_LABELS[entry]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder="Add details (optional, 500 characters)"
            placeholderTextColor={c.onDarkDim}
            multiline
            maxLength={500}
            style={[
              s.input,
              { color: c.onDark, backgroundColor: c.darkCard2, borderColor: c.darkBorder },
            ]}
            accessibilityLabel="Report details"
          />

          {error ? (
            <Text style={[s.error, { color: c.red }]} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          <View style={s.actions}>
            <Pressable
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Cancel report"
              style={[
                s.cancel,
                { borderColor: c.darkBorder, backgroundColor: c.darkCard2 },
              ]}
            >
              <Text style={[s.cancelLabel, { color: c.onDarkSub }]}>Cancel</Text>
            </Pressable>
            <GradientButton
              label={busy ? 'Sending…' : 'Send report'}
              onPress={() => void submit()}
              loading={busy}
              disabled={busy}
              style={{ flexGrow: 1 }}
            />
          </View>
          {busy ? <ActivityIndicator size="small" color={c.primary} style={{ alignSelf: 'center' }} /> : null}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(13,46,107,0.45)',
    justifyContent: 'center',
    padding: 18,
  },
  sheet: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 18,
    gap: 12,
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  title: { ...type.h4 },
  lede: { ...type.small, lineHeight: 19 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reason: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  reasonLabel: { ...type.small, fontWeight: '700' },
  input: {
    ...type.small,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 76,
    textAlignVertical: 'top',
  },
  error: { ...type.small },
  actions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  cancel: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  cancelLabel: { ...type.small, fontWeight: '800' },
});
