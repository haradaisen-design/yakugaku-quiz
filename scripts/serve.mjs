// PC のブラウザでアプリを確認するための小さなサーバー（このPCからだけ見られる）
//   node scripts/serve.mjs [ポート番号]  → http://localhost:8080/
// ※ 暗号の機能は安全な接続（https か localhost）でしか動かないため、スマホでの確認は GitHub Pages で行う
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DOCS_DIR, DATA_DIR } from './lib/common.mjs';

const port = Number(process.argv[2]) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.bin': 'application/octet-stream',
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  // /data/ 以下は暗号化データの場所（テスト時は QUIZ_DATA_DIR）から返す
  const [base, rest] = urlPath.startsWith('/data/') ? [DATA_DIR, urlPath.slice('/data/'.length)] : [DOCS_DIR, urlPath];
  let file = path.normalize(path.join(base, rest));
  if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('見つかりません'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  });
}).listen(port, '127.0.0.1', () => console.log(`アプリの確認用: http://localhost:${port}/  （終了は Ctrl+C）`));
