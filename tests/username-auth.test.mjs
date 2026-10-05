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
import {isSameOrigin} from '../lib/auth/same-origin.ts';
test('same-origin checks use external authority and reject forged cross-origin requests',()=>{
 const request=(origin,host='unbound-lilac.vercel.app')=>new Request('http://localhost/api/auth/username',{headers:{host,...(origin?{origin}:{})}});
 assert.equal(isSameOrigin(request('https://unbound-lilac.vercel.app')),true);
 for(const origin of [undefined,'null','https://attacker.invalid','https://unbound-lilac.vercel.app.attacker.invalid','https://unbound-lilac.vercel.app/path'])assert.equal(isSameOrigin(request(origin)),false);
});
