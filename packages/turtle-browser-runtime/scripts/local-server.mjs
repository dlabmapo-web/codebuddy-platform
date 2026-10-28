// Isolated browser feasibility fixture. Never imports application env or uses production data.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let manifest = JSON.parse(await readFile(resolve(root, 'dist/manifest.json'), 'utf8'));
const product = process.env.COVE_TURTLE_BROWSER_PRODUCT_FIXTURE === '1';
const parentPort = product ? 3028 : 3128;
const parentOrigin = 'http://localhost:' + parentPort, runtimeOrigin = 'http://127.0.0.1:4128';
const config = await readFile(resolve(root, 'dist', manifest.id, 'config.mjs'), 'utf8');
if (!config.includes(JSON.stringify(parentOrigin))) throw new Error('Build with COVE_TURTLE_BROWSER_LOCAL=1 and the selected fixture parent origin');
const types = { html: 'text/html', mjs: 'text/javascript', js: 'text/javascript', css: 'text/css', json: 'application/json' };
for (const port of (product ? [4128] : [3128, 4128])) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, port === parentPort ? parentOrigin : runtimeOrigin);
      manifest = JSON.parse(await readFile(resolve(root, 'dist/manifest.json'), 'utf8'));
      let file;
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
      if (port === 4128) {
        const name = url.pathname.split('/').at(-1);
        if (!url.pathname.startsWith('/' + manifest.id + '/') || !Object.hasOwn(manifest.files, name)) { res.writeHead(404); res.end(); return; }
        file = resolve(root, 'dist', manifest.id, name);
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        const script = name === 'worker.js' ? "'self' 'unsafe-eval'" : "'self'";
        res.setHeader('Content-Security-Policy', `default-src 'none'; script-src ${script}; worker-src ${name === 'worker.js' ? "'none'" : runtimeOrigin + '/' + manifest.id + '/worker.js'}; connect-src 'none'; style-src 'self'; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${parentOrigin}`);
        if (name === 'worker.js' && url.searchParams.has('csp-child-probe')) { res.setHeader('Content-Type', 'text/javascript'); res.end('postMessage("CSP_ESCAPE")'); return; }
      } else {
        if (!['/', '/fixture.mjs', '/fixture.css', '/manifest.json'].includes(url.pathname)) { res.writeHead(404); res.end(); return; }
        if (url.pathname === '/manifest.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ...manifest, runtimeOrigin })); return; }
        file = resolve(root, 'test', url.pathname === '/' ? 'fixture.html' : url.pathname.slice(1));
      }
      res.setHeader('Content-Type', types[file.split('.').at(-1)] ?? 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      await stat(file); res.end(await readFile(file));
    } catch { res.writeHead(500); res.end('Local fixture error'); }
  });
  server.listen(port, '127.0.0.1', () => console.log(`Local-only ${port === parentPort ? parentOrigin : runtimeOrigin}`));
  server.on('error', error => { console.error(error.message); process.exit(1); });
}
