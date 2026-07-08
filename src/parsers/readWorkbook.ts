/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Browser xlsx/csv -> rows adapter (the thin I/O layer the parsers deliberately
 * don't own — see types.ts). Slice 2 upload flow: File -> sheet rows -> parser.
 */

import * as XLSX from 'xlsx';
import type { RawRow } from './types';
import { looksLikeNext } from './next_v1';

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
  // Progressive: multi-sheet xlsx with a 'Detailed' line-item sheet.
  const hasDetailed = wb.sheetNames.includes('Detailed');
  const pHeader = hasDetailed ? wb.sheet('Detailed')?.[0] ?? [] : [];
  const looksProgressive =
    /detailedstatement/i.test(wb.sourceFilename) ||
    (hasDetailed && String(pHeader[6] ?? '').trim() === 'Tran Code' && String(pHeader[1] ?? '').trim() === 'Policy Number');
  if (looksProgressive) return 'progressive_v1';

  // NEXT: single-sheet CSV; sniff the first sheet's header row for its signature.
  const firstSheet = wb.sheet(wb.sheetNames[0]);
  if (firstSheet && firstSheet.length > 0 && looksLikeNext(firstSheet[0])) return 'next_v1';

  return null;
}
