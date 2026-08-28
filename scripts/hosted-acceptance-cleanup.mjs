import { boundedRequest, exactOriginUrl } from './hosted-acceptance-safety.mjs';

const CLEANUP_PATH = '/api/me/data';

export async function compensateTestUserAppData({
  originUrl,
  userAToken,
  userBToken,
  timeoutMs,
  maxResponseBytes,
  requestImpl = boundedRequest,
}) {
  const targetUrl = exactOriginUrl(originUrl, CLEANUP_PATH);
  const principals = [
    ['userA', userAToken],
    ['userB', userBToken],
  ];
  const failures = [];

  for (const [principal, token] of principals) {
    let response;
    try {
      response = await requestImpl(targetUrl, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          Origin: originUrl.origin,
          Authorization: `Bearer ${token}`,
        },
        redirect: 'manual',
      }, { timeoutMs, maxResponseBytes });

      let payload;
      try { payload = JSON.parse(response.body.toString('utf8')); } catch { payload = undefined; }
      const hasExplicitlyEmptyFailedTables = Array.isArray(payload?.failedTables) && payload.failedTables.length === 0;
      if (response.status !== 200 || payload?.success !== true || payload?.operation !== 'app_data_deleted' || !hasExplicitlyEmptyFailedTables) {
        failures.push(principal);
      }
    } catch {
      failures.push(principal);
    } finally {
      if (Buffer.isBuffer(response?.body)) response.body.fill(0);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Compensating app-data cleanup was incomplete for ${failures.join(' and ')}.`);
  }
}
