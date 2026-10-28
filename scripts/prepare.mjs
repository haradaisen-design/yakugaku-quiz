// 問題を作る前の準備: 資料を Claude が読める形にそろえる（結果は work/prepared/<materialId>/）
//   - PowerPoint・Word → PDF に変換（PowerPoint・Word の機能を使う）
//   - 10ページを超える PDF → 10ページずつに分割（Claude はページ指定なしだと10ページまでしか読めないため）
//   node scripts/prepare.mjs               … 新規・変更された資料すべて
//   node scripts/prepare.mjs <materialId> … 指定した資料だけ（問題作成済みの資料も可。/quiz-fix で使う）
//   --json を付けると、資料ごとの「読む順番とページ番号」の一覧を JSON で出力する
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, WORK_DIR, readJson, writeJson } from './lib/common.mjs';
import { scanMaterials } from './lib/materials.mjs';

const require = createRequire(import.meta.url);
const { PDFDocument } = require('./vendor/pdf-lib.min.js');

const CHUNK = 10;
const PREPARED_DIR = path.join(WORK_DIR, 'prepared');
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const ids = args.filter((a) => !a.startsWith('--'));
// --json のときは、人向けのメッセージを標準エラーに出す（JSON を壊さないため）
const say = (msg) => (asJson ? console.error(msg) : console.log(msg));

const safeName = (name) => name.replace(/[\\/:*?"<>|]/g, '_');
const pageLabel = (from, to) => (from === to ? String(from) : `${from}-${to}`);

const OFFICE_TIMEOUT_MS = 5 * 60 * 1000;

function convertOffice(src, dest) {
  const pidFile = `${dest}.pid`;
  const p = spawnSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts', 'convert-office.ps1'),
    '-InputPath', src, '-OutputPath', dest, '-PidFile', pidFile,
  ], { encoding: 'utf8', timeout: OFFICE_TIMEOUT_MS });
  const timedOut = p.error?.code === 'ETIMEDOUT';
  // 応答しなくなったときは、この処理が起動した PowerPoint / Word だけを終了する（自分で開いているものには触れない）
  if (timedOut && fs.existsSync(pidFile)) {
    for (const pid of fs.readFileSync(pidFile, 'utf8').split(',').map((s) => s.trim()).filter(Boolean)) {
      spawnSync('taskkill', ['/PID', pid, '/F'], { stdio: 'ignore' });
    }
  }
  fs.rmSync(pidFile, { force: true });
  if (timedOut) {
    throw new Error('PowerPoint / Word が応答しないため中止しました。初めて使う場合は、一度 PowerPoint / Word を開いて最初の確認画面を閉じてから、もう一度試してください');
  }
  if (p.status !== 0 || !fs.existsSync(dest)) throw new Error((p.stdout + p.stderr).trim() || 'PDF に変換できませんでした');
}

/** PDF を10ページずつに分ける。10ページ以下ならそのまま使う。startPage は資料内での通しページ番号 */
async function splitPdf(src, destBase, startPage) {
  const doc = await PDFDocument.load(fs.readFileSync(src), { ignoreEncryption: true, updateMetadata: false });
  const count = doc.getPageCount();
  if (count <= CHUNK) return { count, parts: [{ path: src, from: startPage, to: startPage + count - 1 }] };
  if (doc.isEncrypted) throw new Error(`保護された PDF のため分割できません（${count}ページ）。PDF を印刷機能で「PDF として保存」し直してから入れてください`);
  const parts = [];
  for (let i = 0; i < count; i += CHUNK) {
    const indices = Array.from({ length: Math.min(CHUNK, count - i) }, (_, k) => i + k);
    const out = await PDFDocument.create();
    for (const page of await out.copyPages(doc, indices)) out.addPage(page);
    const from = startPage + i;
    const to = from + indices.length - 1;
    const file = `${destBase}_p${String(from).padStart(3, '0')}-${String(to).padStart(3, '0')}.pdf`;
    fs.writeFileSync(file, await out.save());
    parts.push({ path: file, from, to });
  }
  return { count, parts };
}

async function prepare(m) {
  const dir = path.join(PREPARED_DIR, m.materialId);
  const listFile = path.join(dir, 'read-list.json');
  if (fs.existsSync(listFile)) {
    const cached = readJson(listFile);
    if (cached.hash === m.hash && cached.items.every((it) => fs.existsSync(it.path))) return cached;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const items = [];
  const problems = [];
  let page = 1;
  for (const f of m.files) {
    try {
      let pdf = f.type === 'pdf' ? f.path : null;
      if (f.type === 'office') {
        pdf = path.join(dir, `${safeName(f.name)}.pdf`);
        convertOffice(f.path, pdf);
      }
      if (pdf) {
        const { count, parts } = await splitPdf(pdf, path.join(dir, safeName(f.name).replace(/\.[^.]+$/, '')), page);
        for (const p of parts) items.push({ path: p.path, pages: pageLabel(p.from, p.to), source: f.name });
        page += count;
      } else {
        // 画像・テキストは1ファイルを1ページとして数える
        items.push({ path: f.path, pages: String(page), source: f.name });
        page += 1;
      }
    } catch (e) {
      problems.push(`${f.name}: ${e.message}`);
    }
  }
  const result = { materialId: m.materialId, sourceFile: m.sourceFile, hash: m.hash, totalPages: page - 1, items, problems };
  if (!problems.length) writeJson(listFile, result);
  return result;
}

const scan = await scanMaterials();
const targets = ids.length
  ? [...scan.new, ...scan.changed, ...scan.unchanged].filter((m) => ids.includes(m.materialId))
  : [...scan.new, ...scan.changed];
const results = [];
for (const m of targets) {
  const r = await prepare(m);
  results.push(r);
  say(`${r.problems.length ? '一部失敗' : '準備OK'}: ${m.sourceFile}（${r.totalPages}ページ・読むファイル${r.items.length}個）`);
  for (const p of r.problems) say(`  - ${p}`);
}
if (!targets.length) say('準備する資料はありません。');
if (asJson) console.log(JSON.stringify(results, null, 2));
process.exit(results.some((r) => r.problems.length) ? 1 : 0);
