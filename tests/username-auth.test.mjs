import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsername, validPassword } from '../supabase/functions/username-auth/validation.js';
test('usernames normalize to one unique safe identity',()=>{
 assert.equal(normalizeUsername(' @Dean_123 '),'dean_123');
 for(const invalid of ['ad','1dean','dean@test.com','a/b','dean user','аdmin','a'.repeat(31),null,{},'admin','@SUPPORT'])assert.equal(normalizeUsername(invalid),null);
});
test('signup passwords have bounded length and are never transformed',()=>{
 assert.equal(validPassword('a long passphrase'),true);
 for(const value of ['', 'short', 'x'.repeat(129),null,{}])assert.equal(validPassword(value),false);
});
