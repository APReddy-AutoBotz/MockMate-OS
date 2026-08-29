import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccountDeletionResponseSchema } from 'mockmate-shared';
import { signOut } from '../../services/supabaseClient';
import { apiClient } from '../../services/apiClient';

const LOCAL_APP_DATA_KEYS = [
  'mockmate_session_history',
  'mockmate_question_usage',
  'mockmate_user_profile',
  'mockmate_pending_grounded_interview_v1',
] as const;

export default function DashboardScreen() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem('mockmate_user_profile')
      .then((stored) => {
        if (mounted && stored) {
          setProfile(JSON.parse(stored));
        }
      })
      .catch((error) => console.error(error))
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
          } catch (error: any) {
            Alert.alert('Sign Out Failed', error?.message || 'Your sign-in session could not be cleared. Please retry.');
            return;
          }

          // These keys are intentionally not user-scoped. Once auth sign-out
          // succeeds, clear them before another account can use this device.
          const cleanupResults = await Promise.allSettled(
            LOCAL_APP_DATA_KEYS.map((key) => AsyncStorage.removeItem(key)),
          );
          const localCleanupFailed = cleanupResults.some((entry) => entry.status === 'rejected');
          setProfile(null);
          router.replace('/(auth)/login');
          if (localCleanupFailed) {
            Alert.alert(
              'Signed Out',
              'Your sign-in session was cleared, but some local MockMate data could not be removed. Reopen the app before another person signs in on this device.',
            );
          }
        },
      },
    ]);
  };

  const handleDeleteAppData = () => {
    Alert.alert(
      'Delete App Data',
      'This permanently deletes your MockMate app data, including saved practice, resume analyses, Career Context and progress. Your Supabase sign-in identity is retained so you can authenticate again later.\n\nContinue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete App Data',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const result = await apiClient.delete('/me/data', AccountDeletionResponseSchema);
              if (!result.success || result.failedTables.length > 0) {
                const failed = result.failedTables.length ? ` (${result.failedTables.join(', ')})` : '';
                throw new Error(`Server could not confirm complete app-data deletion${failed}. Your local session was kept so you can retry.`);
              }

              // From this point onward the irreversible server deletion is a
              // confirmed fact. Local cleanup/sign-out failures must never be
              // misreported as if the server deletion itself failed.
              const deletionMessage = result.authIdentityDeleted
                ? 'Your MockMate app data and sign-in identity were deleted.'
                : result.authIdentityRetainedReason || 'Your MockMate app data was deleted. Your sign-in identity was retained.';

              const cleanupResults = await Promise.allSettled([
                ...LOCAL_APP_DATA_KEYS.map((key) => AsyncStorage.removeItem(key)),
                signOut(),
              ]);
              const signOutResult = cleanupResults[LOCAL_APP_DATA_KEYS.length];
              const signOutSucceeded = signOutResult.status === 'fulfilled';
              const localCleanupFailed = cleanupResults.some((entry) => entry.status === 'rejected');
              setProfile(null);

              if (localCleanupFailed) {
                Alert.alert(
                  'App Data Deleted',
                  `${deletionMessage}\n\nServer deletion is confirmed, but some local session cleanup could not complete. ${signOutSucceeded ? 'You have been signed out; reopen the app if stale local UI remains.' : 'Your sign-in session may still be present on this device. Use Sign Out and retry local cleanup.'}`,
                );
                if (signOutSucceeded) router.replace('/(auth)/login');
              } else {
                Alert.alert('App Data Deleted', deletionMessage);
                router.replace('/(auth)/login');
              }
            } catch (error: any) {
              console.error(error);
              Alert.alert('Deletion Not Confirmed', error?.message || 'MockMate could not confirm complete app-data deletion. Your local session was kept so you can retry.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleAccountMenu = () => {
    Alert.alert(
      'Account Settings',
      'Manage your MockMate account and app data.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Career Context', style: 'default', onPress: () => router.push('/(app)/career-context') },
        { text: 'Sign Out', style: 'default', onPress: handleSignOut },
        { text: 'Delete App Data', style: 'destructive', onPress: handleDeleteAppData },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#d4af37" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeText}>Welcome back,</Text>
            <Text style={styles.nameText}>{profile?.name || 'MockMate User'}</Text>
          </View>
          <TouchableOpacity style={styles.signOutBtn} onPress={handleAccountMenu}>
            <Text style={styles.signOutBtnText}>Account</Text>
          </TouchableOpacity>
        </View>

        {profile && (
          <View style={styles.profileCard}>
            <View style={styles.profileMeta}>
              <Text style={styles.profileLabel}>TARGET ROLE</Text>
              <Text style={styles.profileVal}>{profile.targetRole}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.profileMeta}>
              <Text style={styles.profileLabel}>EXPERIENCE LEVEL</Text>
              <Text style={styles.profileVal}>{profile.experienceLevel.toUpperCase()}</Text>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>Choose a practice area</Text>
        <Text style={styles.sectionIntro}>ClearSpeak is included with every signed-in account.</Text>

        <View style={styles.cardsContainer}>
          <TouchableOpacity
            style={[styles.card, { borderColor: 'rgba(59,130,246,0.18)' }]}
            onPress={() => router.push('/(app)/resume')}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.badgeContainer, { backgroundColor: 'rgba(59,130,246,0.1)' }]}>
                <Text style={[styles.badgeText, { color: '#60a5fa' }]}>RESUME</Text>
              </View>
              <Text style={styles.cardTitle}>Resume builder</Text>
            </View>
            <Text style={styles.cardDesc}>
              Build or upload a resume, review ATS diagnostics, and compare it with a job description.
            </Text>
            <View style={styles.actionRow}>
              <Text style={[styles.actionText, { color: '#60a5fa' }]}>Prepare your resume</Text>
              <Text style={[styles.actionArrow, { color: '#60a5fa' }]}>→</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.card, { borderColor: 'rgba(212,175,55,0.2)' }]}
            onPress={() => router.push('/(app)/speak')}
          >
            <View style={styles.cardHeader}>
              <View style={styles.badgeContainer}>
                <Text style={styles.badgeText}>INCLUDED</Text>
              </View>
              <Text style={styles.cardTitle}>ClearSpeak</Text>
            </View>
            <Text style={styles.cardDesc}>
              Choose a UK or US reference style, record yourself, and listen back. MockMate shows a score only when reliable speech evidence is available.
            </Text>
            <View style={styles.actionRow}>
              <Text style={styles.actionText}>Open speaking practice</Text>
              <Text style={styles.actionArrow}>→</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.card, { borderColor: 'rgba(16,185,129,0.18)' }]}
            onPress={() => router.push('/(app)/interview')}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.badgeContainer, { backgroundColor: 'rgba(16,185,129,0.1)' }]}>
                <Text style={[styles.badgeText, { color: '#34d399' }]}>INTERVIEW</Text>
              </View>
              <Text style={styles.cardTitle}>Mock interviews</Text>
            </View>
            <Text style={styles.cardDesc}>
              Practice role-based questions that adapt to your answers. Add Career Context only when you choose.
            </Text>
            <View style={styles.actionRow}>
              <Text style={[styles.actionText, { color: '#34d399' }]}>Start interview practice</Text>
              <Text style={[styles.actionArrow, { color: '#34d399' }]}>→</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.supportTitle}>Your workspace</Text>

        <View style={styles.cardsContainer}>
          <TouchableOpacity
            style={[styles.card, { borderColor: 'rgba(168,85,247,0.15)' }]}
            onPress={() => router.push('/(app)/career-context')}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.badgeContainer, { backgroundColor: 'rgba(168,85,247,0.1)' }]}>
                <Text style={[styles.badgeText, { color: '#c084fc' }]}>CONTEXT</Text>
              </View>
              <Text style={styles.cardTitle}>Career Context</Text>
            </View>
            <Text style={styles.cardDesc}>
              Review and confirm the career facts MockMate may reuse for personalization.
            </Text>
            <View style={styles.actionRow}>
              <Text style={[styles.actionText, { color: '#c084fc' }]}>Manage Career Context</Text>
              <Text style={[styles.actionArrow, { color: '#c084fc' }]}>→</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.card, { borderColor: 'rgba(148,163,184,0.15)' }]}
            onPress={() => router.push('/(app)/journal')}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.badgeContainer, { backgroundColor: 'rgba(148,163,184,0.1)' }]}>
                <Text style={[styles.badgeText, { color: '#94a3b8' }]}>HISTORY</Text>
              </View>
              <Text style={styles.cardTitle}>Practice Journal</Text>
            </View>
            <Text style={styles.cardDesc}>
              See your saved practice, reports, and progress over time.
            </Text>
            <View style={styles.actionRow}>
              <Text style={[styles.actionText, { color: '#94a3b8' }]}>View journal</Text>
              <Text style={[styles.actionArrow, { color: '#94a3b8' }]}>→</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1329',
  },
  scrollContainer: {
    padding: 24,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0b1329',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  welcomeText: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '500',
  },
  nameText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 2,
  },
  signOutBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  signOutBtnText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  profileCard: {
    backgroundColor: 'rgba(26, 35, 61, 0.8)',
    borderRadius: 18,
    padding: 20,
    flexDirection: 'row',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  profileMeta: {
    flex: 1,
  },
  profileLabel: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  profileVal: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  sectionIntro: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
    marginTop: -8,
  },
  supportTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    marginTop: 30,
  },
  cardsContainer: {
    gap: 16,
  },
  card: {
    backgroundColor: 'rgba(26, 35, 61, 0.8)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  badgeContainer: {
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#d4af37',
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  cardDesc: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 18,
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#d4af37',
  },
  actionArrow: {
    fontSize: 16,
    fontWeight: '700',
    color: '#d4af37',
  },
});
