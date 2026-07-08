/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Slice 1 ingest driver. Exercises the real `progressive_v1` parser on an
 * extracted-workbook JSON and emits normalized output for loading into
 * `commission_statements` + `commission_transactions`.
 *
 * The workbook JSON is `{ sourceFilename, detailedRows, summaryRows }` where each
 * *Rows is an array of raw cell arrays (header row included) — the thin
 * xlsx→rows adapter (openpyxl / SheetJS) lives outside the parser by design
 * (see src/parsers/types.ts). Slice 2 replaces this driver with the upload flow.
 *
 * Usage: tsx scripts/load-progressive.ts <workbook.json> <out-parsed.json>
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parseProgressiveV1 } from '../src/parsers/progressive_v1';
import type { ParserInput } from '../src/parsers/types';

const [, , workbookPath, outPath] = process.argv;
if (!workbookPath || !outPath) {
  console.error('usage: tsx scripts/load-progressive.ts <workbook.json> <out-parsed.json>');
  process.exit(1);
}

const wb = JSON.parse(readFileSync(workbookPath, 'utf8')) as ParserInput & {
  detailedRows: unknown[][];
  summaryRows?: unknown[][];
};

const result = parseProgressiveV1({
  detailedRows: wb.detailedRows as ParserInput['detailedRows'],
  summaryRows: wb.summaryRows as ParserInput['summaryRows'],
  sourceFilename: wb.sourceFilename,
  uploadedBy: 'slice1-loader',
});

writeFileSync(outPath, JSON.stringify(result, null, 2));

// ── Console report ─────────────────────────────────────────────────────────
const typeHist = result.transactions.reduce<Record<string, number>>((acc, t) => {
  acc[t.transaction_type] = (acc[t.transaction_type] ?? 0) + 1;
  return acc;
}, {});

console.log('=== progressive_v1 parse ===');
console.log('carrier          :', result.header.carrier_name);
console.log('rows             :', result.header.row_count);
console.log('period           :', result.header.statement_period_start, '->', result.header.statement_period_end);
console.log('type histogram   :', typeHist);
console.log('--- cross-check (parsed vs carrier-stated) ---');
console.log('premium    parsed:', result.crossCheck.parsed_total_premium, '| stated:', result.header.carrier_stated_total_premium, '| match:', result.crossCheck.premium_matches);
console.log('commission parsed:', result.crossCheck.parsed_total_commission, '| stated:', result.header.carrier_stated_total_commission, '| match:', result.crossCheck.commission_matches);
console.log('net due    parsed:', result.crossCheck.parsed_net_due, '| stated:', result.header.carrier_stated_net_due, '| match:', result.crossCheck.net_due_matches);
console.log('wrote            :', outPath);
