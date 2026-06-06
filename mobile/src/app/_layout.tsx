import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View, StyleSheet, StatusBar } from 'react-native';
import { auth } from '../services/supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function RootLayout() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Listen for auth state changes
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // If logged in, check if user profile exists
        try {
          const profile = await AsyncStorage.getItem('mockmate_user_profile');
          setHasProfile(!!profile);
        } catch {
          setHasProfile(false);
        }
      }
      
      setProfileLoaded(true);
      setLoading(false);
    });

    return () => unsubscribe && unsubscribe();
  }, []);

  useEffect(() => {
    if (loading || !profileLoaded) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    if (!user) {
      // Redirect to login if not authenticated and not already in auth
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else if (!hasProfile) {
      // Redirect to onboarding if authenticated but no profile
      if (!inOnboarding) {
        router.replace('/onboarding');
      }
    } else {
      // Redirect to dashboard (app) if authenticated with profile
      if (inAuthGroup || inOnboarding || (segments as string[]).length === 0 || ((segments as string[]).length === 1 && segments[0] === 'index')) {
        router.replace('/(app)');
      }
    }
  }, [user, loading, hasProfile, segments, profileLoaded, router]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#d4af37" />
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
});
