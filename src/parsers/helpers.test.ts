/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Edge-case tests for the shared parser/normalization helpers (src/parsers/types.ts).
 * These feed both the parsers and the reconciliation math (tran-code → type bucket,
 * money coercion, date/month normalization), so their edge cases matter most.
 * Run: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toNumber, toIsoDate, monthKeyFromIso, normalizeTranCode, deriveSegment, round2,
} from './types';

test('toNumber: currency, commas, parens-negative, blanks', () => {
  assert.equal(toNumber('$1,234.56'), 1234.56);
  assert.equal(toNumber('(50.00)'), -50);      // accounting negative
  assert.equal(toNumber('-8,157'), -8157);
  assert.equal(toNumber(1000), 1000);
  assert.equal(toNumber('0'), 0);
  assert.equal(toNumber(''), null);
  assert.equal(toNumber(null), null);
  assert.equal(toNumber('N/A'), null);
  assert.equal(toNumber('-'), null);
  assert.equal(toNumber(Infinity), null);
});

test('toIsoDate: MM/DD/YYYY, ISO, Excel serial, JS Date', () => {
  assert.equal(toIsoDate('03/20/2026'), '2026-03-20');
  assert.equal(toIsoDate('3/5/2026'), '2026-03-05');   // zero-pad
  assert.equal(toIsoDate('2026-09-20'), '2026-09-20');
  assert.equal(toIsoDate('2026-09-20T00:00:00'), '2026-09-20');
  assert.equal(toIsoDate(new Date(Date.UTC(2026, 5, 8))), '2026-06-08');
  assert.equal(toIsoDate(46023), '2026-01-01');        // Excel serial (1899-12-30 base), UTC math
  assert.equal(toIsoDate(''), null);
  assert.equal(toIsoDate('not a date'), null);
});

test('monthKeyFromIso: YYYYMM integer', () => {
  assert.equal(monthKeyFromIso('2026-03-20'), 202603);
  assert.equal(monthKeyFromIso('2026-12-01'), 202612);
  assert.equal(monthKeyFromIso(null), null);
});

test('normalizeTranCode: cross-carrier bucket map', () => {
  assert.equal(normalizeTranCode('New Business'), 'new');
  assert.equal(normalizeTranCode('  RENEWAL '), 'renewal');       // trim + case-insensitive
  assert.equal(normalizeTranCode('Cancel Pro Rate'), 'cancel');
  assert.equal(normalizeTranCode('Credit Endorsement'), 'adjustment'); // NOT a cancel
  assert.equal(normalizeTranCode('Endorsement'), 'endorsement');
  assert.equal(normalizeTranCode('Reinstatement'), 'reinstatement');
  assert.equal(normalizeTranCode('Something New'), 'unknown');    // don't guess
  assert.equal(normalizeTranCode(null), 'unknown');
});

test('deriveSegment: commercial vs personal', () => {
  assert.equal(deriveSegment('Commercial Auto'), 'commercial');
  assert.equal(deriveSegment('Comm Veh'), 'commercial');
  assert.equal(deriveSegment('Auto'), 'personal');
  assert.equal(deriveSegment('Personal Auto'), 'personal');
  assert.equal(deriveSegment(''), null);
  assert.equal(deriveSegment(null), null);
});

test('round2: kills floating-point dust', () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(19486.275), 19486.28);
  assert.equal(round2(-131.754), -131.75);
});
