import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

// Read env variables (Expo loads EXPO_PUBLIC_* variables from .env files automatically)
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const allowMockAuth = process.env.EXPO_PUBLIC_ENABLE_MOCK_AUTH === 'true';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const isUsingMockAuth = !isSupabaseConfigured && allowMockAuth;

// Custom Secure Store storage adapter for Expo
const ExpoSecureStoreAdapter = {
  getItem: async (key: string) => {
    return SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string) => {
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string) => {
    return SecureStore.deleteItemAsync(key);
  },
};

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: ExpoSecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

const MOCK_USER_KEY = 'mockmate_mock_users';
const MOCK_SESSION_KEY = 'mockmate_current_user';
const SUPABASE_CACHE_KEY = 'mockmate_supabase_cached_user';
const subscribers = new Set<(user: any) => void>();

const getMockUsers = async () => {
  const usersJson = await AsyncStorage.getItem(MOCK_USER_KEY);
  return JSON.parse(usersJson || '{}');
};

const setMockUsers = async (users: any) => {
  await AsyncStorage.setItem(MOCK_USER_KEY, JSON.stringify(users));
};

const notify = (user: any) => subscribers.forEach(cb => cb(user));

const assertAuthConfigured = () => {
  if (!isSupabaseConfigured && !allowMockAuth) {
    throw new Error('MockMate mobile is missing Supabase settings. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }
};

const makeMockUser = (user: any) => ({
  ...user,
  getIdToken: async () => 'test-token',
});

const makeSupabaseUser = (user: User | null) => user
  ? {
      uid: user.id,
      id: user.id,
      email: user.email,
      displayName: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'MockMate user',
      getIdToken: async () => {
        if (!supabase) return '';
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token || '';
      },
    }
  : null;

export const auth = {
  currentUser: null as any,
  
  async loadInitialUser() {
    if (!isSupabaseConfigured && allowMockAuth) {
      try {
        const userJson = await AsyncStorage.getItem(MOCK_SESSION_KEY);
        const user = userJson ? JSON.parse(userJson) : null;
        auth.currentUser = user ? makeMockUser(user) : null;
      } catch {
        auth.currentUser = null;
      }
    } else {
      try {
        const cached = await AsyncStorage.getItem(SUPABASE_CACHE_KEY);
        auth.currentUser = cached ? makeMockUser(JSON.parse(cached)) : null;
      } catch {
        auth.currentUser = null;
      }
    }
    return auth.currentUser;
  },

  onAuthStateChanged(callback: (user: any) => void) {
    // Call with initial user once loaded
    auth.loadInitialUser().then(user => callback(user));

    if (!isSupabaseConfigured && allowMockAuth) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    }

    if (!supabase) return () => {};

    // Get current user via API to ensure latest state
    supabase.auth.getUser().then(async ({ data }) => {
      const user = makeSupabaseUser(data.user);
      if (user) {
        auth.currentUser = user;
        await AsyncStorage.setItem(SUPABASE_CACHE_KEY, JSON.stringify(user));
      } else {
        auth.currentUser = null;
        await AsyncStorage.removeItem(SUPABASE_CACHE_KEY);
      }
      callback(user);
    });

    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = makeSupabaseUser(session?.user ?? null);
      if (user) {
        auth.currentUser = user;
        await AsyncStorage.setItem(SUPABASE_CACHE_KEY, JSON.stringify(user));
      } else {
        auth.currentUser = null;
        await AsyncStorage.removeItem(SUPABASE_CACHE_KEY);
      }
      callback(user);
    });

    return () => data.subscription.unsubscribe();
  },
};

export const createUserWithEmailAndPassword = async (_authObj: any, email: string, pass: string) => {
  assertAuthConfigured();
  const lowerEmail = email.toLowerCase().trim();
  if (!isSupabaseConfigured && allowMockAuth) {
    const users = await getMockUsers();
    if (users[lowerEmail]) {
      const error = new Error('Email already in use') as any;
      error.code = 'auth/email-already-in-use';
      throw error;
    }
    if (pass.length < 6) {
      const error = new Error('Password should be at least 6 characters') as any;
      error.code = 'auth/weak-password';
      throw error;
    }
    const user = { email: lowerEmail, uid: `mock_${Date.now()}`, displayName: lowerEmail.split('@')[0] };
    users[lowerEmail] = { ...user, pass };
    await setMockUsers(users);
    await AsyncStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(user));
    auth.currentUser = makeMockUser(user);
    notify(auth.currentUser);
    return { user: auth.currentUser };
  }

  if (!supabase) throw new Error('Supabase client is not initialized');
  const { data, error } = await supabase.auth.signUp({ email: lowerEmail, password: pass });
  if (error) throw Object.assign(error, { code: error.status === 422 ? 'auth/weak-password' : 'auth/signup-failed' });
  
  const user = makeSupabaseUser(data.user);
  auth.currentUser = user;
  return { user };
};

export const signInWithEmailAndPassword = async (_authObj: any, email: string, pass: string) => {
  assertAuthConfigured();
  const lowerEmail = email.toLowerCase().trim();
  if (!isSupabaseConfigured && allowMockAuth) {
    const users = await getMockUsers();
    const user = users[lowerEmail];
    if (!user || user.pass !== pass) {
      const error = new Error('Invalid credentials') as any;
      error.code = 'auth/invalid-credential';
      throw error;
    }
    const sessionUser = { email: user.email, uid: user.uid, displayName: user.displayName };
    await AsyncStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(sessionUser));
    auth.currentUser = makeMockUser(sessionUser);
    notify(auth.currentUser);
    return { user: auth.currentUser };
  }

  if (!supabase) throw new Error('Supabase client is not initialized');
  const { data, error } = await supabase.auth.signInWithPassword({ email: lowerEmail, password: pass });
  if (error) throw Object.assign(error, { code: 'auth/invalid-credential' });
  
  const user = makeSupabaseUser(data.user);
  auth.currentUser = user;
  return { user };
};

export const signOut = async () => {
  if (!isSupabaseConfigured && allowMockAuth) {
    await AsyncStorage.removeItem(MOCK_SESSION_KEY);
    auth.currentUser = null;
    notify(null);
    return;
  }
  if (supabase) {
    await supabase.auth.signOut();
  }
  await AsyncStorage.removeItem(SUPABASE_CACHE_KEY);
  auth.currentUser = null;
};

export const getAccessToken = async (): Promise<string | null> => {
  if (!isSupabaseConfigured) return isUsingMockAuth && auth.currentUser ? 'test-token' : null;
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
};
