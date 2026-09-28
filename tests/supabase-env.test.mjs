import assert from 'node:assert/strict';
import test from 'node:test';
import { getSupabaseEnv } from '../lib/supabase/env.ts';

test('public Supabase configuration rejects unsafe or mismatched credentials without echoing values', () => {
  const names = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NODE_ENV'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const jwt = claims => `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.test-signature`;
  try {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_SUPABASE_URL = ' https://example.supabase.co/ \n';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ' sb_publishable_testfixture \n';
    assert.deepEqual(getSupabaseEnv(), { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_testfixture' });
    for (const key of ['sb_secret_testfixture', 'placeholder', jwt({ role: 'service_role', ref: 'example' }), jwt({ role: 'authenticated' })]) {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;
      assert.throws(getSupabaseEnv, error => !error.message.includes(key) && error.message.includes('public publishable'));
    }
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = jwt({ role: 'anon', ref: 'wrongproject' });
    assert.throws(getSupabaseEnv, /different projects/);
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = jwt({ role: 'anon', ref: 'example' });
    assert.equal(getSupabaseEnv().url, 'https://example.supabase.co');
    for (const url of ['not-a-url', 'https://example.supabase.co/auth/v1', 'https://example.supabase.co?key=test', 'http://example.supabase.co']) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = url;
      assert.throws(getSupabaseEnv, /NEXT_PUBLIC_SUPABASE_URL/);
    }
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});
