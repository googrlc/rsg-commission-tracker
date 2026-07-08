/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Browser xlsx/csv -> rows adapter (the thin I/O layer the parsers deliberately
 * don't own — see types.ts). Slice 2 upload flow: File -> sheet rows -> parser.
 */

import * as XLSX from 'xlsx';
import type { RawRow } from './types';

export interface Workbook {
  sheetNames: string[];
  sheet: (name: string) => RawRow[] | undefined;
  sourceFilename: string;
}

export async function readWorkbook(file: File): Promise<Workbook> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  return {
    sheetNames: wb.SheetNames,
    sourceFilename: file.name,
    sheet: (name: string) => {
      const ws = wb.Sheets[name];
      if (!ws) return undefined;
      return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false }) as RawRow[];
    },
  };
}

/**
 * Detect which parser handles this workbook (spec §3: filename + content sniff).
 * Returns null when the format is unrecognized — caller must NOT guess.
 */
export function detectParserKey(wb: Workbook): string | null {
  const hasDetailed = wb.sheetNames.includes('Detailed');
  const header = hasDetailed ? wb.sheet('Detailed')?.[0] ?? [] : [];
  const looksProgressive =
    /detailedstatement/i.test(wb.sourceFilename) ||
    (hasDetailed && String(header[6] ?? '').trim() === 'Tran Code' && String(header[1] ?? '').trim() === 'Policy Number');
  return looksProgressive ? 'progressive_v1' : null;
}
