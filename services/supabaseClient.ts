import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const getEnvVar = (name: string): string => {
  const candidates = [name, name.toUpperCase(), name.toLowerCase()];
  const read = (obj: any, key: string) => {
    if (!obj || typeof obj !== 'object') return '';
    if (obj[key]) return String(obj[key]);
    const found = Object.keys(obj).find(k => k.toUpperCase() === key.toUpperCase());
    return found ? String(obj[found]) : '';
  };

  for (const key of candidates) {
    try {
      const value = read(typeof process !== 'undefined' ? process.env : null, key) || read(window as any, key);
      if (value) return value;
    } catch {
      // Browser/test environments may not expose every global.
    }
  }
  return '';
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

const MOCK_USER_KEY = 'mockmate_mock_users';
const MOCK_SESSION_KEY = 'mockmate_current_user';
const subscribers = new Set<(user: any) => void>();

const getMockUsers = () => JSON.parse(localStorage.getItem(MOCK_USER_KEY) || '{}');
const setMockUsers = (users: any) => localStorage.setItem(MOCK_USER_KEY, JSON.stringify(users));
const notify = (user: any) => subscribers.forEach(cb => cb(user));

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
        const { data } = await supabase!.auth.getSession();
        return data.session?.access_token || '';
      },
    }
  : null;

export const auth = {
  get currentUser() {
    if (!isSupabaseConfigured) {
      try {
        const user = JSON.parse(localStorage.getItem(MOCK_SESSION_KEY) || 'null');
        return user ? makeMockUser(user) : null;
      } catch {
        return null;
      }
    }

    try {
      const cached = JSON.parse(localStorage.getItem('mockmate_supabase_cached_user') || 'null');
      return cached ? makeMockUser(cached) : null;
    } catch {
      return null;
    }
  },
  onAuthStateChanged: (callback: (user: any) => void) => {
    if (!isSupabaseConfigured) {
      subscribers.add(callback);
      callback(auth.currentUser);
      return () => subscribers.delete(callback);
    }

    supabase!.auth.getUser().then(({ data }) => {
      const user = makeSupabaseUser(data.user);
      if (user) localStorage.setItem('mockmate_supabase_cached_user', JSON.stringify(user));
      else localStorage.removeItem('mockmate_supabase_cached_user');
      callback(user);
    });

    const { data } = supabase!.auth.onAuthStateChange((_event, session) => {
      const user = makeSupabaseUser(session?.user ?? null);
      if (user) localStorage.setItem('mockmate_supabase_cached_user', JSON.stringify(user));
      else localStorage.removeItem('mockmate_supabase_cached_user');
      callback(user);
    });

    return () => data.subscription.unsubscribe();
  },
};

export const createUserWithEmailAndPassword = async (_authObj: any, email: string, pass: string) => {
  const lowerEmail = email.toLowerCase().trim();
  if (!isSupabaseConfigured) {
    const users = getMockUsers();
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
    setMockUsers(users);
    localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(user));
    notify(makeMockUser(user));
    return { user: makeMockUser(user) };
  }

  const { data, error } = await supabase!.auth.signUp({ email: lowerEmail, password: pass });
  if (error) throw Object.assign(error, { code: error.status === 422 ? 'auth/weak-password' : 'auth/signup-failed' });
  return { user: makeSupabaseUser(data.user) };
};

export const signInWithEmailAndPassword = async (_authObj: any, email: string, pass: string) => {
  const lowerEmail = email.toLowerCase().trim();
  if (!isSupabaseConfigured) {
    const users = getMockUsers();
    const user = users[lowerEmail];
    if (!user || user.pass !== pass) {
      const error = new Error('Invalid credentials') as any;
      error.code = 'auth/invalid-credential';
      throw error;
    }
    const sessionUser = { email: user.email, uid: user.uid, displayName: user.displayName };
    localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(sessionUser));
    notify(makeMockUser(sessionUser));
    return { user: makeMockUser(sessionUser) };
  }

  const { data, error } = await supabase!.auth.signInWithPassword({ email: lowerEmail, password: pass });
  if (error) throw Object.assign(error, { code: 'auth/invalid-credential' });
  return { user: makeSupabaseUser(data.user) };
};

export const signInWithGoogle = async () => {
  if (!isSupabaseConfigured) {
    const error = new Error('Google sign-in is unavailable in practice mode') as any;
    error.code = 'mock/google-disabled';
    throw error;
  }
  const { error } = await supabase!.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw Object.assign(error, { code: 'auth/google-failed' });
};

export const signOut = async (_authObj?: any) => {
  if (!isSupabaseConfigured) {
    localStorage.removeItem(MOCK_SESSION_KEY);
    notify(null);
    return;
  }
  await supabase!.auth.signOut();
  localStorage.removeItem('mockmate_supabase_cached_user');
};

export const getAccessToken = async (): Promise<string | null> => {
  if (!isSupabaseConfigured) return auth.currentUser ? 'test-token' : null;
  const { data } = await supabase!.auth.getSession();
  return data.session?.access_token || null;
};

export const db = {};
export const googleProvider = null;
export const isUsingMockAuth = !isSupabaseConfigured;
