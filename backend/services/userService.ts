import { supabaseAdmin } from '../supabaseAdmin';

const fallbackProfiles = new Map<string, any>();

export const getUserProfile = async (uid: string) => {
    if (!supabaseAdmin) return fallbackProfiles.get(uid) || null;
    const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('user_id', uid)
        .maybeSingle();
    if (error) throw error;
    return data ? { uid: data.user_id, ...data } : null;
};

export const updateUserProfile = async (uid: string, data: any) => {
    const payload = {
        user_id: uid,
        full_name: data.fullName || data.full_name || data.name || null,
        target_role: data.targetRole || data.target_role || null,
        primary_goal: data.primaryGoal || data.primary_goal || null,
        experience_level: data.experienceLevel || data.experience_level || null,
        onboarding_complete: data.onboardingComplete ?? data.onboarding_complete ?? false,
        updated_at: new Date().toISOString(),
    };

    if (!supabaseAdmin) {
        const merged = { ...(fallbackProfiles.get(uid) || {}), uid, ...data, updatedAt: payload.updated_at };
        fallbackProfiles.set(uid, merged);
        return merged;
    }

    const { error } = await supabaseAdmin
        .from('profiles')
        .upsert(payload, { onConflict: 'user_id' });
    if (error) throw error;
    return { uid, ...data };
};

export const ensureUserProfile = async (uid: string, email: string) => {
    const profile = await getUserProfile(uid);
    if (profile) return profile;

    const newProfile = {
        uid,
        email,
        createdAt: new Date().toISOString(),
        preferences: {},
        stats: { sessionsCompleted: 0 },
    };

    if (!supabaseAdmin) {
        fallbackProfiles.set(uid, newProfile);
        return newProfile;
    }

    const { error } = await supabaseAdmin.from('profiles').upsert({
        user_id: uid,
        full_name: email?.split('@')[0] || null,
        created_at: newProfile.createdAt,
        updated_at: newProfile.createdAt,
    }, { onConflict: 'user_id' });
    if (error) throw error;
    return newProfile;
};
