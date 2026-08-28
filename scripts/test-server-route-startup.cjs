const assert = require('node:assert/strict');
const { once } = require('node:events');
const path = require('node:path');

process.env.MOCKMATE_RUNTIME_MODE = 'test';
for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
  delete process.env[key];
}
delete global.DOMMatrix;
delete global.Path2D;
delete global.ImageData;

const { app } = require(path.resolve(__dirname, '../backend/dist/server.js'));

assert.equal(typeof global.DOMMatrix, 'function', 'PDF worker must install DOMMatrix during server startup');
assert.equal(typeof global.Path2D, 'function', 'PDF worker must install Path2D during server startup');
assert.equal(typeof global.ImageData, 'function', 'PDF worker must install ImageData during server startup');

(async () => {
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address === 'object', 'server must expose an ephemeral loopback port');
    const origin = `http://127.0.0.1:${address.port}`;

    const meResponse = await fetch(`${origin}/api/me/data`);
    assert.equal(meResponse.status, 401, 'required /api/me route must mount and reject unauthenticated requests');

    const clearSpeakResponse = await fetch(`${origin}/api/clearspeak/accent-profiles`);
    assert.equal(clearSpeakResponse.status, 200, 'required ClearSpeak route group must mount');

    console.log('Fresh server startup guard passed (PDF globals, /api/me, and ClearSpeak routes).');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Fresh server startup guard failed.');
  process.exitCode = 1;
});
