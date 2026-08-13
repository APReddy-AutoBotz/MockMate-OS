# Repository extraction

Extract `creator-studio/` as the root of its own private repository. Preserve commit history for this directory, private Supabase storage, RLS migrations, and human approval gates.

Before extraction, verify that no generated media, biometric sample, access token, service-role key, or model weight is present. Publishing integrations, social OAuth scopes, and real voice/avatar providers remain prohibited. Configure deployment secrets outside Git and retain explicit `demo`/`test` mock-mode boundaries.
