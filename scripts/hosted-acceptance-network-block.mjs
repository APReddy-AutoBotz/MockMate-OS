globalThis.fetch = async function blockedHostedAcceptanceFetch() {
  throw new Error('__P0_8_NETWORK_BLOCKED_AFTER_MANIFEST_PREFLIGHT__');
};
