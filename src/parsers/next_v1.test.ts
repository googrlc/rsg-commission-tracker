/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Edge-case tests for the NEXT parser (spec §6b). NEXT is as-earned: the statement
 * carries both cumulative "…to date" and incremental "…this month" columns. The
 * critical rule is that we normalize on the INCREMENTAL month value (summable across
 * monthly loads without double-counting). Header-indexed, so a column reorder is safe.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNextV1, looksLikeNext } from './next_v1';
import type { RawRow } from './types';

const HEADER: RawRow = [
  'Policy Number','LOB','Business Name','Statement Date','Effective Date','Expiration Date',
  'New Renewal','Agent Commission','Agency Commission Paid to Date','Agency Commission Paid this Month',
  'Total Premium Collected to Date','Premium Collected this Month','Policy Status',
];
const DATA: RawRow = [
  'NX-100','General Liability','Acme LLC','2026-05-31','2026-01-01','2026-12-31',
  'New', 0.15, 500 /* to date */, 42.5 /* this month */, 3400 /* to date */, 283.33 /* this month */, 'Active',
];

test('looksLikeNext: recognizes the distinctive headers', () => {
  assert.equal(looksLikeNext(HEADER), true);
  assert.equal(looksLikeNext(['policy number', 'premium']), false);
});

test('next_v1: uses INCREMENTAL month values, not cumulative to-date', () => {
  const r = parseNextV1({ detailedRows: [HEADER, DATA], sourceFilename: 'NEXT_May2026.csv' });
  assert.equal(r.transactions.length, 1);
  const t = r.transactions[0];
  assert.equal(t.commission_amount, 42.5);   // paid THIS month, not 500 to-date
  assert.equal(t.gross_premium, 283.33);      // premium THIS month, not 3400 to-date
  assert.equal(t.commission_rate, 0.15);
  assert.notEqual(t.commission_amount, 500);
});

test('next_v1: carrier, segment, month_key, type', () => {
  const r = parseNextV1({ detailedRows: [HEADER, DATA], sourceFilename: 'NEXT_May2026.csv' });
  const t = r.transactions[0];
  assert.equal(r.header.carrier_name, 'NEXT INS US CO');
  assert.equal(r.header.source_format, 'csv');
  assert.equal(t.segment, 'commercial');       // NEXT is small-commercial
  assert.equal(t.month_key, 202605);
  assert.equal(t.transaction_type, 'new');
  // as-earned: no carrier-stated totals to cross-check
  assert.equal(r.crossCheck.commission_matches, null);
});

test('next_v1: header-indexed (column reorder is safe)', () => {
  const reordered: RawRow = [
    'Business Name','Policy Number','Agent Commission','Agency Commission Paid this Month',
    'Premium Collected this Month','Statement Date','New Renewal','LOB',
  ];
  const dataR: RawRow = ['Acme LLC','NX-200', 0.2, 99.99, 500, '2026-06-30', 'Renewal', 'BOP'];
  const r = parseNextV1({ detailedRows: [reordered, dataR], sourceFilename: 'x.csv' });
  const t = r.transactions[0];
  assert.equal(t.policy_number, 'NX-200');
  assert.equal(t.commission_amount, 99.99);
  assert.equal(t.transaction_type, 'renewal');
  assert.equal(t.month_key, 202606);
});

test('next_v1: rejects a non-NEXT statement (no guessing)', () => {
  assert.throws(() => parseNextV1({
    detailedRows: [['Policy #', 'Carrier', 'Premium'], ['A', 'B', 1]],
    sourceFilename: 'other.csv',
  }), /does not match the NEXT format/);
});
