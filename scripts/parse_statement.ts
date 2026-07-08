/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Headless statement parser runner. Reads a commission file (csv/xlsx) from disk,
 * detects its carrier parser, and prints the normalized ParseResult as JSON on
 * stdout — so a non-Node caller (the commission-inbox poller) can reuse the exact
 * same parsers the browser upload flow uses. Unknown format -> {"parserKey": null}.
 *
 *   npx tsx scripts/parse_statement.ts <path> [uploadedBy]
 */
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import type { RawRow } from '../src/parsers/types';
import { detectParserKey, type Workbook } from '../src/parsers/readWorkbook';
import { getParser } from '../src/parsers/registry';

function workbookFromFile(path: string): Workbook {
  const wb = XLSX.read(fs.readFileSync(path), { type: 'buffer' });
  return {
    sheetNames: wb.SheetNames,
    sourceFilename: path.split('/').pop() ?? path,
    sheet: (name: string) => {
      const ws = wb.Sheets[name];
      if (!ws) return undefined;
      return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false }) as RawRow[];
    },
  };
}

function main() {
  const [path, uploadedBy] = process.argv.slice(2);
  if (!path) { console.error('usage: parse_statement.ts <path> [uploadedBy]'); process.exit(2); }

  const wb = workbookFromFile(path);
  const parserKey = detectParserKey(wb);
  if (!parserKey) {
    console.log(JSON.stringify({ parserKey: null, sheetNames: wb.sheetNames }));
    return;
  }
  const parser = getParser(parserKey);
  if (!parser) { console.log(JSON.stringify({ parserKey: null })); return; }

  // Map sheets: Progressive uses Detailed/Summary; single-sheet CSVs (NEXT) use the first.
  const detailedRows = wb.sheet('Detailed') ?? wb.sheet(wb.sheetNames[0]) ?? [];
  const summaryRows = wb.sheet('Summary');
  const result = parser({ detailedRows, summaryRows, sourceFilename: wb.sourceFilename, uploadedBy: uploadedBy ?? null });
  console.log(JSON.stringify({ parserKey, ...result }));
}

main();
