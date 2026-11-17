import { Pressable, StyleSheet, Text, View } from 'react-native';

// What a stranded native Google return carries: the one-time code the app
// must exchange, or the reason Supabase gave when it could not finish.
export type StrandedGoogleReturn = {
  code: string | null;
  error: string | null;
};

const SUPPORT_MAILTO =
  'mailto:support@creatordna.app?subject=Google%20sign-in%20help';

// A native sign-in return the browser could not hand to the app lands on
// /auth/callback with the one-time code in the query. The PKCE verifier
// lives in the app's storage — never in this browser — so the page's only
// job is to bounce the code back: one tap fires the creatordna:// deep
// link the app already listens for, and the app finishes the exchange.
//
// Deliberately no auto-navigation: Chrome blocks external-protocol
// launches that lack a user gesture, and an attempted launch with no app
// installed would swap this page for an error one. The button is the
// reliable path; nothing here ever exchanges or discards the code.
export function GoogleReturnRecovery({ reason }: { reason: StrandedGoogleReturn }) {
  const openApp = () => {
    if (typeof window === 'undefined') {
      return;
    }
    // Keep the full query (code, state): the app parses what it needs and
    // Supabase already validated the state on the way here.
    window.location.href = `creatordna://auth/callback${window.location.search}`;
  };

  const backHome = () => {
    if (typeof window === 'undefined') {
      return;
    }
    window.location.replace('/');
  };

  const failed = !reason.code;

  return (
    <View style={styles.screen} accessibilityViewIsModal>
      <View style={styles.card}>
        <View style={styles.logoDot} />
        <Text style={styles.brand}>CreatorDNA</Text>

        {failed ? (
          <>
            <Text style={styles.title}>Google sign-in couldn’t finish</Text>
            <Text style={styles.body}>
              {reason.error
                ? `Google returned: ${reason.error}. `
                : ''}
              Try again from the app — email and password always work too.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={backHome}
              style={({ pressed }) => [styles.primary, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.primaryLabel}>Back to CreatorDNA</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.title}>Finish signing in</Text>
            <Text style={styles.body}>
              Google sign-in happened in your browser. Open the CreatorDNA
              app to finish — it already has everything this sign-in needs.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={openApp}
              style={({ pressed }) => [styles.primary, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.primaryLabel}>Open CreatorDNA app</Text>
            </Pressable>
            <Text style={styles.caption}>
              If nothing happens, make sure CreatorDNA is installed on this
              device, then tap again.
            </Text>
          </>
        )}

        <Pressable
          accessibilityRole="link"
          onPress={() => {
            if (typeof window !== 'undefined') {
              window.location.href = SUPPORT_MAILTO;
            }
          }}
          style={({ pressed }) => [styles.support, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.supportLabel}>Email support@creatordna.app</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Jungle dark, matching the app's locked palette.
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#06140D',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
    backgroundColor: '#0D1F16',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#16382A',
    padding: 32,
  },
  logoDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#16A85E',
    marginBottom: 14,
  },
  brand: {
    color: '#E8F5EE',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 22,
  },
  title: {
    color: '#E8F5EE',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    color: '#9FB8AC',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  primary: {
    backgroundColor: '#16A85E',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 28,
    width: '100%',
    alignItems: 'center',
  },
  primaryLabel: {
    color: '#04120B',
    fontSize: 16,
    fontWeight: '800',
  },
  caption: {
    color: '#6F8C7F',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 14,
  },
  support: {
    marginTop: 26,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  supportLabel: {
    color: '#16A85E',
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
