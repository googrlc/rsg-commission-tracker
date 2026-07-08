/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Edge-case tests for the Progressive statement parser (spec §6). Feeds a synthetic
 * `Detailed` sheet built to the fixed §6 column layout plus a `Summary` sheet, and
 * asserts the tricky bits: MVR fee-line detection, negative cancel commission,
 * Credit Endorsement → adjustment (not cancel), effective/expiration date capture,
 * segment derivation, and the parsed-vs-stated cross-check.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProgressiveV1 } from './progressive_v1';
import type { RawRow } from './types';

// §6 columns: 0 Insured 1 Policy 2 Eff 3 Exp 4 Prod 5 AgtPre 6 TranCode 7 TranDate
// 8 GrossPrem 9 DownColl 10 DownSub 11 Billed 12 AgencyDue 13 Comm 14 GrossComm
// 15 NetDue 16 ProdName 17 AgentCode 18 MonthEnd 19 RenewalCount
const HEADER: RawRow = [
  'Insured Name','Policy Number','Policy Effective Date','Policy Expiration Date','Prod',
  'Agt Pre','Tran Code','Tran Date','Gross Premium','Down Payment Collected','Down Payment Submitted',
  'Billed Amount','Agency Due','Comm','Gross Comm','Net Due Agent','Prod Name','Agent Code','Month End','Renewal Count',
];
const row = (o: Partial<Record<string, unknown>>): RawRow => {
  const r: RawRow = new Array(20).fill(null);
  const put = (i: number, v: unknown) => { r[i] = (v ?? null) as never; };
  put(0, o.insured); put(1, o.policy); put(2, o.eff); put(3, o.exp); put(4, o.prod);
  put(6, o.code); put(7, o.date); put(8, o.gross); put(12, o.agencyDue); put(13, o.rate);
  put(14, o.grossComm); put(15, o.netDue); put(18, o.monthEnd);
  return r;
};

function parse() {
  const detailedRows: RawRow[] = [
    HEADER,
    row({ insured: 'Douglas, Shamira', policy: '871502820', eff: '03/20/2026', exp: '09/20/2026', prod: 'Auto', code: 'New Business', date: '03/20/2026', gross: 2054, rate: 0.1, grossComm: 205.4, netDue: 205.4 }),
    row({ insured: 'Douglas, Shamira', policy: '871502820', eff: '03/20/2026', exp: '09/20/2026', prod: 'Auto', code: 'Cancel Pro Rate', date: '06/08/2026', gross: -1317.54, rate: 0.1, grossComm: -131.75, netDue: -131.75 }),
    row({ insured: 'Fleet LLC', policy: '999', eff: '01/01/2026', exp: '01/01/2027', prod: 'Commercial Auto', code: 'Renewal', date: '01/01/2026', gross: 5000, rate: 0.15, grossComm: 750, netDue: 750 }),
    row({ insured: 'MVR Guy', policy: '871502820', eff: '03/20/2026', exp: '09/20/2026', prod: 'Auto', code: 'Endorsement', date: '05/04/2026', gross: 0, agencyDue: 4.8, rate: 0, grossComm: 0, netDue: -4.8 }),
    row({ insured: 'Credit Co', policy: '555', eff: '02/01/2026', exp: '08/01/2026', prod: 'Auto', code: 'Credit Endorsement', date: '02/10/2026', gross: -100, rate: 0.1, grossComm: -10, netDue: -10 }),
  ];
  const summaryRows: RawRow[] = [
    ['', '', '', ''],
    ['Agent Total', 5636.46, '', 813.65],  // net premium (col1), commission (col3)
    ['Net amount due agent', 808.85],
  ];
  return parseProgressiveV1({ detailedRows, summaryRows, sourceFilename: 'DetailedStatement20260630.xlsx', uploadedBy: 't' });
}

test('progressive_v1: row count drops header + carrier is canonical', () => {
  const r = parse();
  assert.equal(r.transactions.length, 5);
  assert.equal(r.header.carrier_name, 'Progressive');
  assert.equal(r.header.source_format, 'xlsx');
});

test('progressive_v1: MVR fee line — agency due, zero commission', () => {
  const fee = parse().transactions.find((t) => t.transaction_type === 'fee');
  assert.ok(fee, 'a fee line is detected');
  assert.equal(fee!.fee_type, 'MVR');
  assert.equal(fee!.fee_amount, 4.8);
  assert.equal(fee!.commission_amount, 0);
});

test('progressive_v1: cancel is negative commission, typed cancel', () => {
  const cancel = parse().transactions.find((t) => t.transaction_code === 'Cancel Pro Rate');
  assert.equal(cancel!.transaction_type, 'cancel');
  assert.equal(cancel!.commission_amount, -131.75);
});

test('progressive_v1: Credit Endorsement is adjustment, not cancel', () => {
  const credit = parse().transactions.find((t) => t.transaction_code === 'Credit Endorsement');
  assert.equal(credit!.transaction_type, 'adjustment');
});

test('progressive_v1: effective/expiration dates captured in raw_row', () => {
  const nb = parse().transactions.find((t) => t.transaction_code === 'New Business');
  assert.equal(nb!.raw_row.policy_effective_date, '03/20/2026');
  assert.equal(nb!.raw_row.policy_expiration_date, '09/20/2026');
});

test('progressive_v1: commercial segment + month_key derived', () => {
  const comm = parse().transactions.find((t) => t.lob === 'Commercial Auto');
  assert.equal(comm!.segment, 'commercial');
  assert.equal(comm!.month_key, 202601);
});

test('progressive_v1: cross-check nets commission (incl. negatives) vs stated', () => {
  const r = parse();
  // 205.4 - 131.75 + 750 + 0 - 10 = 813.65
  assert.equal(r.crossCheck.parsed_total_commission, 813.65);
  assert.equal(r.crossCheck.commission_matches, true);
  // fee lines are excluded from commission but counted as fee drag
  const fees = r.transactions.reduce((s, t) => s + (t.fee_amount ?? 0), 0);
  assert.equal(fees, 4.8);
});
