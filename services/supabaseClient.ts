import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getRuntimeConfig, validateRuntimeConfig } from './runtimeConfig';

const config = getRuntimeConfig();
const validation = validateRuntimeConfig();

export const isSupabaseConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
export const isUsingMockAuth = config.isDevelopment && config.enableDevAuth;

if (!validation.valid && !isUsingMockAuth) {
  throw new Error(validation.error || 'Missing Supabase configuration.');
}

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

const subscribers = new Set<(user: any) => void>();
const notify = (user: any) => subscribers.forEach(cb => cb(user));

let devMockUser: any = null;

const createMockUser = (email: string, pass: string) => ({
  id: `mock_${Date.now()}`,
  email,
  pass, // Keep in memory, do not store in localStorage
  user_metadata: { full_name: email.split('@')[0] }
});

export const auth = {
  get currentUser() {
    if (isUsingMockAuth && devMockUser) {
      return devMockUser;
    }
    // We do NOT return a cached Supabase user synchronously.
    // Callers relying on synchronous currentUser should use onAuthStateChanged or getSession().
    // We return null and let onAuthStateChanged push updates.
    return null;
  },
  onAuthStateChanged: (callback: (user: any) => void) => {
    subscribers.add(callback);
    
    if (isUsingMockAuth) {
      callback(devMockUser);
      return () => subscribers.delete(callback);
    }

    if (supabase) {
      supabase.auth.getUser().then(({ data }) => {
        callback(data.user);
      });

      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
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

  if (!supabase) throw new Error("Supabase is not configured.");
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
    // Automatically create if not found in mock mode to simulate a simple login
    devMockUser = createMockUser(lowerEmail, pass);
    notify(devMockUser);
    return { user: devMockUser };
  }

  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.signInWithPassword({ email: lowerEmail, password: pass });
  if (error) throw Object.assign(error, { code: 'auth/invalid-credential' });
  return { user: data.user };
};

export const signInWithGoogle = async () => {
  if (isUsingMockAuth) {
    throw Object.assign(new Error('Google sign-in is unavailable in practice mode'), { code: 'mock/google-disabled' });
  }
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw Object.assign(error, { code: 'auth/google-failed' });
};

export const signOut = async (_authObj?: any) => {
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
