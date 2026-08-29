const APPROVED_HOST_SUFFIXES = ['.vercel.app', '.netlify.app'];

export function exactHostedOrigin(value) {
  const hasExplicitPort = typeof value === 'string' && /^https:\/\/[^/?#]+:\d+(?:[/?#]|$)/i.test(value);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Hosted preview origin must be an absolute URL.');
  }
  const approvedHost = APPROVED_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
  if (url.protocol !== 'https:' || !approvedHost || url.username || url.password || url.port || hasExplicitPort || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Hosted preview origin must be an exact HTTPS .vercel.app or .netlify.app origin.');
  }
  return url;
}

export function exactOriginUrl(originUrl, requestPath) {
  if (typeof requestPath !== 'string' || !requestPath.startsWith('/') || requestPath.startsWith('//') || requestPath.includes('\\')) {
    throw new Error('Request path must be a single-slash relative path on the authorized origin.');
  }
  const resolved = new URL(requestPath, originUrl);
  if (resolved.origin !== originUrl.origin || resolved.username || resolved.password) {
    throw new Error('Request resolved outside the authorized origin.');
  }
  return resolved;
}

export async function boundedRequest(url, options, { timeoutMs, maxResponseBytes, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Hosted request timed out.')), timeoutMs);
  const aborted = new Promise((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
  });
  const chunks = [];
  let reader;
  let responseBytes = 0;
  try {
    const response = await Promise.race([fetchImpl(url, { ...options, signal: controller.signal }), aborted]);
    if (response.body) {
      reader = response.body.getReader();
      while (true) {
        const { done, value } = await Promise.race([reader.read(), aborted]);
        if (done) break;
        responseBytes += value.byteLength;
        if (responseBytes > maxResponseBytes) {
          value.fill(0);
          throw new Error('Hosted response is oversized.');
        }
        chunks.push(Buffer.from(value));
        value.fill(0);
      }
    }
    const body = Buffer.concat(chunks, responseBytes);
    chunks.forEach((chunk) => chunk.fill(0));
    return { status: response.status, headers: response.headers, body };
  } catch (error) {
    controller.abort();
    if (reader) {
      try { await reader.cancel(); } catch { /* cancellation is best effort */ }
    }
    chunks.forEach((chunk) => chunk.fill(0));
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function boundedAbandonedRequest(url, options, { timeoutMs, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Hosted abandoned request timed out.')), timeoutMs);
  const aborted = new Promise((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
  });
  let response;
  try {
    response = await Promise.race([fetchImpl(url, { ...options, signal: controller.signal }), aborted]);
    if (response.body) {
      try { await response.body.cancel(); } catch { /* abandonment is best effort */ }
    }
    return { status: response.status, headers: response.headers };
  } catch (error) {
    controller.abort();
    if (response?.body) {
      try { await response.body.cancel(); } catch { /* cancellation is best effort */ }
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
