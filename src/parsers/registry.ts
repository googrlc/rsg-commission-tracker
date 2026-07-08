/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Parser registry (spec §3). `carrier_commission_profile.statement_parser_key`
 * maps a carrier to its parser module. Slice 2's upload flow will: detect carrier
 * (filename + alias map + content sniff) → look up the key → dispatch here.
 * Unknown key → null (caller lands rows in a staging state, spec §3).
 */

import type { StatementParser } from './types';
import { parseProgressiveV1, PROGRESSIVE_V1_KEY } from './progressive_v1';

const REGISTRY: Record<string, StatementParser> = {
  [PROGRESSIVE_V1_KEY]: parseProgressiveV1,
};

export function getParser(parserKey: string | null | undefined): StatementParser | null {
  if (!parserKey) return null;
  return REGISTRY[parserKey] ?? null;
}

export function registeredParserKeys(): string[] {
  return Object.keys(REGISTRY);
}

export { PROGRESSIVE_V1_KEY };
