// Syntax-check every engine source file with `node --check`.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
const files = readdirSync(srcDir).filter((f) => f.endsWith('.js'));

for (const file of files) {
  execFileSync(process.execPath, ['--check', join(srcDir, file)], { stdio: 'inherit' });
}
console.log(`node --check: ${files.length} file(s) OK`);
