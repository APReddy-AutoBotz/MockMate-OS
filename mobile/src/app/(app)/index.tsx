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
import { signOut, getAccessToken } from '../../services/supabaseClient';
import { API_BASE } from '../../services/apiBase';

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
          await signOut();
          await AsyncStorage.removeItem('mockmate_user_profile');
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account & Data',
      'This will permanently delete all your practice history, custom resume analyses, and progress reports. This action cannot be undone.\n\nAre you sure you want to proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const token = await getAccessToken();
              if (token) {
                const res = await fetch(`${API_BASE}/me/data`, {
                  method: 'DELETE',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                  },
                });
                if (!res.ok) {
                  const errorData = await res.json().catch(() => null);
                  throw new Error(errorData?.error || 'Failed to delete remote account data');
                }
              }
              
              // Clear local database history & profiles
              await AsyncStorage.removeItem('mockmate_session_history');
              await AsyncStorage.removeItem('mockmate_question_usage');
              await AsyncStorage.removeItem('mockmate_user_profile');
              
              // Sign out from Auth provider
              await signOut();
              
              Alert.alert('Data Deleted', 'Your account and practice data have been successfully deleted.');
              router.replace('/(auth)/login');
            } catch (error: any) {
              console.error(error);
              Alert.alert('Error', error.message || 'Failed to delete account. Please try again.');
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
      'Manage your MockMate account.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'default', onPress: handleSignOut },
        { text: 'Delete Account', style: 'destructive', onPress: handleDeleteAccount },
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

        <Text style={styles.sectionTitle}>Your practice home</Text>

        <View style={styles.cardsContainer}>
          {/* Card 1: Interview practice */}
          <TouchableOpacity
            style={[styles.card, { borderColor: 'rgba(212,175,55,0.15)' }]}
            onPress={() => router.push('/(app)/interview')}
          >
            <View style={styles.cardHeader}>
              <View style={styles.badgeContainer}>
                <Text style={styles.badgeText}>POPULAR</Text>
              </View>
              <Text style={styles.cardTitle}>Interview practice</Text>
            </View>
            <Text style={styles.cardDesc}>
              Practice role-based questions, speak your answers, and get clear next steps.
            </Text>
            <View style={styles.actionRow}>
              <Text style={styles.actionText}>Start interview practice</Text>
              <Text style={styles.actionArrow}>→</Text>
            </View>
          </TouchableOpacity>

          {/* Card 2: Speaking Coach */}
          <TouchableOpacity
            style={[styles.card, { borderColor: 'rgba(16,185,129,0.15)' }]}
            onPress={() => router.push('/(app)/speak')}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.badgeContainer, { backgroundColor: 'rgba(16,185,129,0.1)' }]}>
                <Text style={[styles.badgeText, { color: '#10b981' }]}>VOICE</Text>
              </View>
              <Text style={styles.cardTitle}>ClearSpeak Coach</Text>
            </View>
            <Text style={styles.cardDesc}>
              Practice spoken English with short prompts and simple feedback.
            </Text>
            <View style={styles.actionRow}>
              <Text style={[styles.actionText, { color: '#10b981' }]}>Open speaking practice</Text>
              <Text style={[styles.actionArrow, { color: '#10b981' }]}>→</Text>
            </View>
          </TouchableOpacity>

          {/* Card 3: Resume Reviewer */}
          <TouchableOpacity
            style={[styles.card, { borderColor: 'rgba(59,130,246,0.15)' }]}
            onPress={() => router.push('/(app)/resume')}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.badgeContainer, { backgroundColor: 'rgba(59,130,246,0.1)' }]}>
                <Text style={[styles.badgeText, { color: '#3b82f6' }]}>ATS</Text>
              </View>
              <Text style={styles.cardTitle}>ATS Resume Review</Text>
            </View>
            <Text style={styles.cardDesc}>
              Upload your resume to check ATS fit and find simple improvements.
            </Text>
            <View style={styles.actionRow}>
              <Text style={[styles.actionText, { color: '#3b82f6' }]}>Review resume</Text>
              <Text style={[styles.actionArrow, { color: '#3b82f6' }]}>→</Text>
            </View>
          </TouchableOpacity>

          {/* Card 4: Practice Journal */}
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
