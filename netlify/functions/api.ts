import serverless from 'serverless-http';
import app from '../../backend/server';

/**
 * Netlify adapter only. All application routes, auth, RLS-backed services,
 * quotas, replay protection and deletion authority remain in backend/server.
 */
export const handler = serverless(app);
