// Builds build/qa-image (Swift, Apple frameworks only) when missing or stale.
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const SRC = fileURLToPath(new URL('../tools/qa-image.swift', import.meta.url));
const BIN = fileURLToPath(new URL('../../build/qa-image', import.meta.url));
export function ensureTools() {
  if (!existsSync(BIN) || statSync(BIN).mtimeMs < statSync(SRC).mtimeMs) execFileSync('swiftc', ['-O', SRC, '-o', BIN], { stdio: 'inherit' });
  return BIN;
}
