import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View, Text, StyleSheet, StatusBar } from 'react-native';
import { auth } from '../services/supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCAL_USER_DATA_KEYS = [
  'mockmate_session_history',
  'mockmate_question_usage',
  'mockmate_user_profile',
  'mockmate_pending_grounded_interview_v1',
] as const;

export default function RootLayout() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [isolationError, setIsolationError] = useState('');

  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    let active = true;
    let authGeneration = 0;

    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      const requestGeneration = ++authGeneration;
      setLoading(true);
      setProfileLoaded(false);
      setIsolationError('');

      let ownsLocalProfile = false;
      try {
        if (currentUser) {
          const stored = await AsyncStorage.getItem('mockmate_user_profile');
          if (stored) {
            const profile = JSON.parse(stored);
            if (profile && profile.userId === currentUser.id) {
              ownsLocalProfile = true;
            } else {
              // All current mobile local practice keys are global device keys.
              // A different/legacy owner must be cleared before this account can
              // enter onboarding or the app, otherwise local history/context can
              // leak across accounts on the same device.
              await Promise.all(LOCAL_USER_DATA_KEYS.map((key) => AsyncStorage.removeItem(key)));
            }
          }
        }
      } catch {
        if (!active || requestGeneration !== authGeneration) return;
        setUser(currentUser);
        setHasProfile(false);
        setProfileLoaded(true);
        setLoading(false);
        setIsolationError('MockMate could not safely isolate local data for this account. Reopen the app before continuing or signing in as another user.');
        return;
      }

      if (!active || requestGeneration !== authGeneration) return;
      setUser(currentUser);
      setHasProfile(ownsLocalProfile);
      setProfileLoaded(true);
      setLoading(false);
    });

    return () => {
      active = false;
      authGeneration += 1;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (loading || !profileLoaded || isolationError) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    if (!user) {
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else if (!hasProfile) {
      if (!inOnboarding) {
        router.replace('/onboarding');
      }
    } else if (inAuthGroup || inOnboarding || (segments as string[]).length === 0 || ((segments as string[]).length === 1 && segments[0] === 'index')) {
      router.replace('/(app)');
    }
  }, [user, loading, hasProfile, segments, profileLoaded, isolationError, router]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#d4af37" />
      </View>
    );
  }

  if (isolationError) {
    return (
      <View style={styles.blockedContainer}>
        <Text style={styles.blockedTitle}>Local account data locked</Text>
        <Text style={styles.blockedText}>{isolationError}</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#0b1329" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0b1329' } }}>
        <Stack.Screen name="(auth)/login" options={{ gestureEnabled: false }} />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="(app)" options={{ gestureEnabled: false }} />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0b1329',
  },
  blockedContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#0b1329',
  },
  blockedTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 10,
  },
  blockedText: {
    color: '#fecaca',
    fontSize: 14,
    lineHeight: 21,
  },
});
