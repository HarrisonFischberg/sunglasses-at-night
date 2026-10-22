// Fixture server for the Safari QA suite (macOS Safari and the iOS Simulator
// both reach it on 127.0.0.1 / localhost). Serves qa/fixtures and records
// beacons: fixture pages report what the page itself can observe (the
// extension's <html> attributes, computed colors, timings) so a run can prove
// the installed extension is active without injecting anything.
//
//   ?delay=<ms>  hold the whole response (slow sheet/script)
//   ?stall=<ms>  send up to <body>, hold the rest (paint before content)
//   POST /beacon?run=<id>   body: JSON, appended to <beaconDir>/<id>.jsonl
//   GET  /beacons?run=<id>  the recorded lines as a JSON array
import { createServer } from 'node:http';
import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { extname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../fixtures/', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json',
};

export function startServer({ port = 8765, beaconDir }) {
  mkdirSync(beaconDir, { recursive: true });
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    // ?csp=strict sends a Content-Security-Policy that forbids inline styles
    // (style-src 'self'), like sites that only allow their own stylesheets.
    const csp = url.searchParams.get('csp') === 'strict' ? { 'content-security-policy': "style-src 'self'; script-src 'self' 'unsafe-inline'" } : {};
    const send = (code, type, body) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'access-control-allow-origin': '*', ...csp }); res.end(body); };
    const run = (url.searchParams.get('run') || 'default').replace(/[^\w.-]/g, '_');
    if (url.pathname === '/beacon' && req.method === 'POST') {
      let b = '';
      req.on('data', (c) => { b += c; if (b.length > 1e6) req.destroy(); });
      req.on('end', () => { appendFileSync(join(beaconDir, `${run}.jsonl`), b.replace(/\n/g, ' ') + '\n'); send(204, 'text/plain', ''); });
      return;
    }
    if (url.pathname === '/beacons') {
      const f = join(beaconDir, `${run}.jsonl`);
      const lines = existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }) : [];
      return send(200, 'application/json', JSON.stringify(lines));
    }
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(ROOT, '.' + path);
    if (!file.startsWith(ROOT) || !existsSync(file)) return send(404, 'text/plain', 'not found');
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    const body = readFileSync(file);
    const delay = Number(url.searchParams.get('delay')) || 0;
    const stall = Number(url.searchParams.get('stall')) || 0;
    const go = () => {
      if (stall > 0 && extname(file) === '.html') {
        const text = body.toString('utf8');
        const m = /<body[^>]*>/i.exec(text);
        if (m) {
          const cut = m.index + m[0].length;
          res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', ...csp });
          res.write(text.slice(0, cut) + `<!--${' '.repeat(2048)}-->`);
          const t = setTimeout(() => res.end(text.slice(cut)), stall);
          res.on('close', () => clearTimeout(t));
          return;
        }
      }
      send(200, type, body);
    };
    if (delay > 0) { const t = setTimeout(go, delay); res.on('close', () => clearTimeout(t)); } else go();
  });
  return new Promise((r, j) => { server.once('error', j); server.listen(port, '0.0.0.0', () => r(server)); });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.QA_PORT || 8765);
  const beaconDir = process.env.QA_BEACONS || fileURLToPath(new URL('../../build/qa/beacons/', import.meta.url));
  startServer({ port, beaconDir }).then(() => console.log(`qa fixtures on http://127.0.0.1:${port}/ beacons → ${beaconDir}`));
}
