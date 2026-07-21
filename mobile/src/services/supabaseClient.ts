import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const allowMockAuth = process.env.EXPO_PUBLIC_ENABLE_MOCK_AUTH === 'true';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const isDevelopmentMode = typeof __DEV__ !== 'undefined' && __DEV__;
export const isUsingMockAuth = isDevelopmentMode && allowMockAuth;

if (!isSupabaseConfigured && !isUsingMockAuth) {
  throw new Error("Missing Supabase configuration. Production must fail closed if Supabase configuration is missing.");
}

const ExpoSecureStoreAdapter = {
  getItem: async (key: string) => SecureStore.getItemAsync(key),
  setItem: async (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: async (key: string) => SecureStore.deleteItemAsync(key),
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

const subscribers = new Set<(user: any) => void>();
const notify = (user: any) => subscribers.forEach(cb => cb(user));

let devMockUser: any = null;

const createMockUser = (email: string, pass: string) => ({
  id: `mock_${Date.now()}`,
  email,
  pass, 
  user_metadata: { full_name: email.split('@')[0] }
});

export const auth = {
  get currentUser() {
    if (isUsingMockAuth && devMockUser) return devMockUser;
    return null;
  },
  onAuthStateChanged(callback: (user: any) => void) {
    subscribers.add(callback);
    
    if (isUsingMockAuth) {
      callback(devMockUser);
      return () => subscribers.delete(callback);
    }

    if (supabase) {
      supabase.auth.getUser().then(({ data }) => callback(data.user));

      const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
        callback(session?.user ?? null);
      });

      return () => {
        data.subscription.unsubscribe();
        subscribers.delete(callback);
      };
    }

    return () => subscribers.delete(callback);
  },
};

export const createUserWithEmailAndPassword = async (_authObj: any, email: string, pass: string) => {
  const lowerEmail = email.toLowerCase().trim();
  if (isUsingMockAuth) {
    if (pass.length < 6) {
      throw Object.assign(new Error('Password should be at least 6 characters'), { code: 'auth/weak-password' });
    }
    devMockUser = createMockUser(lowerEmail, pass);
    notify(devMockUser);
    return { user: devMockUser };
  }

  if (!supabase) throw new Error('Supabase client is not initialized');
  const { data, error } = await supabase.auth.signUp({ email: lowerEmail, password: pass });
  if (error) throw Object.assign(error, { code: error.status === 422 ? 'auth/weak-password' : 'auth/signup-failed' });
  return { user: data.user };
};

export const signInWithEmailAndPassword = async (_authObj: any, email: string, pass: string) => {
  const lowerEmail = email.toLowerCase().trim();
  if (isUsingMockAuth) {
    if (devMockUser && devMockUser.email === lowerEmail && devMockUser.pass === pass) {
       notify(devMockUser);
       return { user: devMockUser };
    }
    devMockUser = createMockUser(lowerEmail, pass);
    notify(devMockUser);
    return { user: devMockUser };
  }

  if (!supabase) throw new Error('Supabase client is not initialized');
  const { data, error } = await supabase.auth.signInWithPassword({ email: lowerEmail, password: pass });
  if (error) throw Object.assign(error, { code: 'auth/invalid-credential' });
  return { user: data.user };
};

export const signOut = async () => {
  if (isUsingMockAuth) {
    devMockUser = null;
    notify(null);
    return;
  }
  if (supabase) {
    await supabase.auth.signOut();
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (isUsingMockAuth) return devMockUser ? 'test-token' : null;
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
};
