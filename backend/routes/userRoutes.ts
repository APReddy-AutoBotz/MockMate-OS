
import { Router } from 'express';
import { verifyAuthToken } from '../middleware/authMiddleware';
import * as userService from '../services/userService';
import * as sessionService from '../services/sessionService';
import { getUsageSummary } from '../services/usageService';

const router = Router();

router.use(verifyAuthToken);

// Get User Profile
router.get('/profile', async (req: any, res) => {
    try {
        const userId = req.user.uid;
        const profile = await userService.ensureUserProfile(userId, req.user.email);
        res.json(profile);
    } catch (error: any) {
        console.error("Get Profile Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Update User Profile
router.post('/profile', async (req: any, res) => {
    try {
        const userId = req.user.uid;
        const profile = await userService.updateUserProfile(userId, req.body);
        res.json(profile);
    } catch (error: any) {
        console.error("Update Profile Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Read the authenticated user's bounded daily usage state. This is intentionally
// owner-scoped and read-only so acceptance can prove quota effects without admin
// authority or direct database access.
router.get('/usage', async (req: any, res) => {
    try {
        const userId = req.user.uid;
        res.json(await getUsageSummary(userId));
    } catch (error: any) {
        console.error("Get Usage Error:", error);
        res.status(500).json({ error: 'Could not load usage summary' });
    }
});

// Get User Sessions
router.get('/sessions', async (req: any, res) => {
    try {
        const userId = req.user.uid;
        const sessions = await sessionService.getUserSessions(userId);
        res.json(sessions);
    } catch (error: any) {
        console.error("Get Sessions Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get Single Session
router.get('/sessions/:id', async (req: any, res) => {
    try {
        const userId = req.user.uid;
        const sessionId = req.params.id;
        const session = await sessionService.getSession(userId, sessionId);

        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (session.userId !== userId) return res.status(403).json({ error: 'Unauthorized' });

        res.json(session);
    } catch (error: any) {
        console.error("Get Session Error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;