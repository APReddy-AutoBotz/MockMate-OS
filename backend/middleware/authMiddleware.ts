
import { Request, Response, NextFunction } from 'express';
import { isSupabaseConfigured, supabaseAdmin } from '../supabaseAdmin';

export const verifyAuthToken = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = (authHeader && authHeader.startsWith('Bearer ')) 
        ? authHeader.split('Bearer ')[1].trim() 
        : null;

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const devAuthEnabled =
        process.env.NODE_ENV === 'development' &&
        process.env.ENABLE_DEV_AUTH === 'true';

    if (token === 'test-token' && devAuthEnabled) {
        (req as any).user = { uid: 'test-user', email: 'test@example.com', name: 'Pilot Tester' };
        return next();
    }

    if (process.env.NODE_ENV === 'test' && token.startsWith('test-token')) {
        const userId = token.includes('other') ? 'other-user-id' : 'test-user-id';
        (req as any).user = { uid: userId, id: userId, email: `${userId}@example.com`, name: 'Test User' };
        return next();
    }

    if (!isSupabaseConfigured || !supabaseAdmin) {
        return res.status(503).json({ error: 'Auth service unavailable (Supabase is not configured)' });
    }

    try {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data.user) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }
        (req as any).user = {
            uid: data.user.id,
            id: data.user.id,
            email: data.user.email,
            role: 'authenticated',
        };
        next();
    } catch (error) {
        console.error('Token verification failed', error);
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};
