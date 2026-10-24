import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInviteCode, roomInviteUrl } from '../lib/room-invite.ts';

const code = '0123456789abcdef0123456789abcdef';
const origin = 'https://game.example';

test('invite input accepts copied codes and same-site share links without navigating', () => {
  assert.equal(normalizeInviteCode(`  ${code.toUpperCase()}  `), code);
  assert.equal(normalizeInviteCode('01234567-89ABCDEF 01234567-89ABCDEF'), code);
  const link = roomInviteUrl(`${origin}/old-path?unused=1#old`, code.toUpperCase());
  assert.equal(link, `${origin}/?room=${code}`);
  assert.equal(normalizeInviteCode(link, origin), code);
  assert.equal(normalizeInviteCode(link), code);
});

test('malformed, ambiguous or foreign invite links fail without exposing session data', () => {
  for (const value of [null, undefined, 123, '', 'a'.repeat(31), 'a'.repeat(33), 'z'.repeat(32),
    `${origin}/?room=${code}&room=${code}`, `${origin}/?token=${code}`,
    `javascript:alert(1)?room=${code}`, `ftp://game.example/?room=${code}`,
    `https://name:password@game.example/?room=${code}`, 'a'.repeat(2049)]) {
    assert.equal(normalizeInviteCode(value, origin), null, String(value));
  }
  assert.equal(normalizeInviteCode(`https://other.example/?room=${code}`, origin), null);
  assert.throws(() => roomInviteUrl(origin, 'wrong'));
  assert.throws(() => roomInviteUrl('javascript:alert(1)', code));
});
