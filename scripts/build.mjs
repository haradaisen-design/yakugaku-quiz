// 問題バンク（quiz-bank/）を暗号化して、アプリの公開フォルダ（docs/data/）に出力する
//   node scripts/build.mjs          … 検査 → 暗号化 → 出力 → アプリと同じ方法で復号できるか確認
//   node scripts/build.mjs --quiet  … 結果の1行だけ表示
// パスワードは .secrets/quiz-password.txt から読む（「パスワードを設定.cmd」で作成）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { DOCS_DIR, DATA_DIR, PASSWORD_FILE, collator, compareTerms, readJson, writeJson, toPosix, sha256 } from './lib/common.mjs';
import { validateBank } from './lib/validate-core.mjs';

const ITERATIONS = 600000;
const quiet = process.argv.includes('--quiet');
const fail = (msg) => { console.error(`エラー: ${msg}`); process.exit(1); };

// 復号の確認には、アプリ本体と同じ部品を使う
const { CHECK_TEXT, importKey, decryptJson, checkKey } = await import(pathToFileURL(path.join(DOCS_DIR, 'js', 'crypto.js')).href);

function readPassword() {
  if (!fs.existsSync(PASSWORD_FILE)) fail('パスワードが未設定です。「パスワードを設定.cmd」をダブルクリックして設定してください。');
  const pw = fs.readFileSync(PASSWORD_FILE, 'utf8').replace(/^﻿/, '').trim().normalize('NFC');
  if (pw.length < 8) fail('パスワードが短すぎます。「パスワードを設定.cmd」で8文字以上に設定し直してください。');
  return pw;
}

function encrypt(key, plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([iv, c.update(plain), c.final(), c.getAuthTag()]);
}

function listFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(abs));
    else out.push(abs);
  }
  return out;
}

/** アプリ本体のファイル一覧と版番号を sw.js に書き込む（変わったときだけスマホ側が更新される） */
function updateServiceWorker() {
  const swPath = path.join(DOCS_DIR, 'sw.js');
  const rel = (abs) => toPosix(path.relative(DOCS_DIR, abs));
  const files = listFiles(DOCS_DIR)
    .filter((f) => !/^(data\/|sw\.js$|\.nojekyll$)/.test(rel(f)))
    .sort((a, b) => collator.compare(rel(a), rel(b)));
  const version = sha256(files.map((f) => `${rel(f)}\n${sha256(fs.readFileSync(f))}`).join('\n')).slice(0, 12);
  const block = [
    '// BUILD:BEGIN（scripts/build.mjs が自動で書き換える）',
    `const APP_VERSION = '${version}';`,
    `const APP_SHELL = ${JSON.stringify(['./', ...files.map(rel)], null, 2)};`,
    '// BUILD:END',
  ].join('\n');
  const before = fs.readFileSync(swPath, 'utf8');
  const after = before.replace(/\/\/ BUILD:BEGIN[\s\S]*?\/\/ BUILD:END/, block);
  if (after !== before) fs.writeFileSync(swPath, after, 'utf8');
  return { version, changed: after !== before };
}

// 1. 検査（エラーがあれば出力しない）
const { errors, warnings, materials } = validateBank();
if (errors.length) {
  for (const e of errors) console.error(`エラー: ${e}`);
  fail(`問題データにエラーが ${errors.length} 件あります。直してからもう一度実行してください。`);
}

// 2. 鍵の準備（salt は初回に作って meta.json に保存し、以後は同じものを使う）
const metaFile = path.join(DATA_DIR, 'meta.json');
const oldMeta = fs.existsSync(metaFile) ? readJson(metaFile) : null;
const salt = oldMeta?.kdf?.salt ? Buffer.from(oldMeta.kdf.salt, 'base64') : crypto.randomBytes(16);
const key = crypto.pbkdf2Sync(readPassword(), salt, ITERATIONS, 32, 'sha256');
const webKey = await importKey(new Uint8Array(key));
// ファイル名用の鍵（ファイル名から科目名や内容が推測されないようにする）
const nameKey = Buffer.from(crypto.hkdfSync('sha256', key, Buffer.alloc(0), 'yq-file-names', 32));
const tag = (s) => crypto.createHmac('sha256', nameKey).update(s).digest('hex').slice(0, 12);
const kdf = { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: salt.toString('base64') };
let check = oldMeta?.check;
if (!check || oldMeta.kdf?.iterations !== ITERATIONS || !(await checkKey(webKey, check))) {
  check = encrypt(key, Buffer.from(CHECK_TEXT)).toString('base64');
}

// 3. 科目ごとにまとめて暗号化（内容が同じなら同じファイル名になり、書き直さない）
fs.mkdirSync(DATA_DIR, { recursive: true });
const writeEncrypted = (name, json) => {
  const file = path.join(DATA_DIR, name);
  if (fs.existsSync(file)) return false;
  fs.writeFileSync(file, encrypt(key, zlib.gzipSync(json, { level: 9 })));
  return true;
};
const groups = new Map();
// 「問題にしない資料」（講義日程など）はアプリに載せない
const quizMaterials = materials.filter((m) => !m.skipped);
for (const { data: d } of quizMaterials) {
  const k = `${d.term}\u0000${d.subject}`;
  if (!groups.has(k)) groups.set(k, { term: d.term, subject: d.subject, materials: [] });
  groups.get(k).materials.push(d);
}
const keep = new Set(['meta.json']);
const updated = [];
const terms = new Map();
let totalQuestions = 0;
const sortedGroups = [...groups.values()].sort((a, b) => compareTerms(a.term, b.term) || collator.compare(a.subject, b.subject));
for (const g of sortedGroups) {
  const mats = g.materials
    .sort((a, b) => collator.compare(a.sourceFile, b.sourceFile))
    .map((d, i) => ({
      id: d.materialId,
      title: d.title,
      source: path.posix.basename(d.sourceFile),
      order: i + 1,
      generatedAt: d.generatedAt,
      updatedAt: d.updatedAt || d.generatedAt,
      keyPoints: d.keyPoints,
      questions: d.questions.filter((q) => !q.retired).map(({ retired, ...q }) => q),
    }));
  const json = JSON.stringify({ term: g.term, subject: g.subject, materials: mats });
  const name = `b-${tag(`${g.term}/${g.subject}`)}.${tag(json)}.bin`;
  keep.add(name);
  if (writeEncrypted(name, json)) updated.push(`${g.term} ${g.subject}`);
  const count = mats.reduce((s, m) => s + m.questions.length, 0);
  totalQuestions += count;
  if (!terms.has(g.term)) terms.set(g.term, []);
  terms.get(g.term).push({
    subject: g.subject,
    bundle: name,
    count,
    materials: mats.map((m) => ({ id: m.id, title: m.title, count: m.questions.length, generatedAt: m.generatedAt, updatedAt: m.updatedAt })),
  });
}
const catalogJson = JSON.stringify({ terms: [...terms].map(([term, subjects]) => ({ term, subjects })) });
const catalogName = `c.${tag(catalogJson)}.bin`;
keep.add(catalogName);
writeEncrypted(catalogName, catalogJson);

const meta = { format: 1, dataVersion: tag(catalogJson), kdf, check, catalog: catalogName };
const metaChanged = JSON.stringify(meta) !== JSON.stringify(oldMeta);
if (metaChanged) writeJson(metaFile, meta);

// 4. 使われなくなった古いデータを消す
const removed = fs.readdirSync(DATA_DIR).filter((f) => !keep.has(f));
for (const f of removed) fs.unlinkSync(path.join(DATA_DIR, f));

// 5. アプリ本体の版番号を更新
const sw = updateServiceWorker();

// 6. アプリと同じ方法で復号できるか確認
if (!(await checkKey(webKey, meta.check))) fail('確認用データを復号できません');
const catalog = await decryptJson(webKey, fs.readFileSync(path.join(DATA_DIR, catalogName)));
for (const t of catalog.terms) {
  for (const s of t.subjects) {
    const bundle = await decryptJson(webKey, fs.readFileSync(path.join(DATA_DIR, s.bundle)));
    if (bundle.term !== t.term || bundle.subject !== s.subject) fail(`${t.term} ${s.subject} のデータが正しく復号できません`);
  }
}

// 7. 結果
const materialCount = quizMaterials.length;
if (!quiet) {
  for (const [term, subjects] of terms) {
    console.log(`【${term}】`);
    for (const s of subjects) console.log(`  ${s.subject}: 資料${s.materials.length}件 / ${s.count}問`);
  }
  if (warnings.length) console.log(`注意 ${warnings.length}件（node scripts/validate.mjs で確認できます）`);
  if (updated.length) console.log(`更新した科目: ${updated.join('、')}`);
  if (removed.length) console.log(`削除した古いデータ: ${removed.length}件`);
  if (sw.changed) console.log(`アプリ本体の版: ${sw.version}`);
}
const changed = metaChanged || updated.length > 0 || removed.length > 0 || sw.changed;
console.log(`${changed ? '出力しました' : '変更はありません'}: 資料 ${materialCount}件 / 問題 ${totalQuestions}問（復号の確認OK）`);
