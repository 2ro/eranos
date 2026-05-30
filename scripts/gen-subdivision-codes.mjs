// Generate src/lib/subdivisionCodes.ts — the authoritative list of ISO 3166-2
// subdivision codes, extracted from the `iso-3166` package.
//
// We ship only the code strings (~42 KB) instead of importing the full
// `iso-3166` dataset (~244 KB of objects with names, parents, and tree
// structure) into the critical-path bundle. The only thing the runtime needs
// these for is validating that a `CC-XX` code is a real subdivision
// (see src/lib/countries.ts `isValidSubdivisionCode`).
//
// Run with: node scripts/gen-subdivision-codes.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { iso31662 } from 'iso-3166';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(REPO_ROOT, 'src/lib/subdivisionCodes.ts');

const codes = [...new Set(iso31662.map((s) => s.code))].sort();

const header = `// AUTO-GENERATED — do not edit by hand.
//
// The authoritative list of ISO 3166-2 subdivision codes, extracted from the
// \`iso-3166\` package at build time. We ship only the code strings (~42 KB)
// instead of importing the full \`iso-3166\` dataset (~244 KB of objects with
// names, parents, and tree structure) into the critical-path bundle, since
// the only thing the runtime needs these for is validating that a \`CC-XX\`
// code is a real subdivision.
//
// Regenerate with: node scripts/gen-subdivision-codes.mjs

`;

const body = `export const SUBDIVISION_CODES: readonly string[] = ${JSON.stringify(codes)};\n`;

fs.writeFileSync(OUTPUT, header + body);
console.log(`Wrote ${path.relative(REPO_ROOT, OUTPUT)} (${codes.length} codes)`);
