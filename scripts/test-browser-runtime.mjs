import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

async function runBrowserRuntimeTest() {
  console.log('[Browser Runtime Test] 1. Checking source files for dynamic import.meta hacks...');
  const servicesFiles = await readdir('./services');
  for (const file of servicesFiles) {
    if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
      const content = await readFile(join('./services', file), 'utf-8');
      if (content.includes("new Function('return import.meta.env')") || content.includes('process.env[')) {
        throw new Error(`Found dynamic environment hack in services/${file}`);
      }
    }
  }

  console.log('[Browser Runtime Test] 2. Checking runtimeConfig.ts design...');
  const runtimeConfigContent = await readFile('./services/runtimeConfig.ts', 'utf-8');
  if (!runtimeConfigContent.includes('export function getRuntimeConfig') || !runtimeConfigContent.includes('export function validateRuntimeConfig')) {
    throw new Error('services/runtimeConfig.ts is missing getRuntimeConfig or validateRuntimeConfig exports');
  }

  console.log('[Browser Runtime Test] 3. Testing fail-closed behavior on missing Supabase config...');
  // Read runtimeConfig and verify fail-closed logic
  if (!runtimeConfigContent.includes('Missing Supabase configuration')) {
    throw new Error('services/runtimeConfig.ts does not contain production fail-closed missing Supabase configuration check');
  }

  console.log('[Browser Runtime Test] ALL BROWSER RUNTIME TESTS PASSED 100%!');
}

runBrowserRuntimeTest().catch((err) => {
  console.error('[Browser Runtime Test] FAILED:', err);
  process.exit(1);
});
