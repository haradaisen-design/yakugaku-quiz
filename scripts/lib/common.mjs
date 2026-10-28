// 各スクリプトで共通に使う場所の定義と小さな道具
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// テストのときは環境変数で入力（資料）と問題バンクの場所を差し替えられる
export const MATERIALS_DIR = path.resolve(process.env.QUIZ_MATERIALS_DIR || path.join(ROOT, '薬学部授業資料'));
export const BANK_DIR = path.resolve(process.env.QUIZ_BANK_DIR || path.join(ROOT, 'quiz-bank'));
export const WORK_DIR = path.join(ROOT, 'work');
export const DOCS_DIR = path.join(ROOT, 'docs');
// テストのときは暗号化データの出力先も差し替える（本番の docs/data を書き換えないため）
export const DATA_DIR = path.resolve(process.env.QUIZ_DATA_DIR || path.join(DOCS_DIR, 'data'));
export const PASSWORD_FILE = path.resolve(process.env.QUIZ_PASSWORD_FILE || path.join(ROOT, '.secrets', 'quiz-password.txt'));
export const GITHUB_TOKEN_FILE = path.join(ROOT, '.secrets', 'github-token.txt');

export const collator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });

export const nfc = (s) => s.normalize('NFC');
export const toPosix = (p) => p.split(path.sep).join('/');
/** ROOT からの相対パス（表示用） */
export const relFromRoot = (abs) => toPosix(path.relative(ROOT, abs));

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

/** 学期コードの並び順: 2S1 < 2S2 < 2A1 < 2A2 < 3S1 … （形式外はうしろ） */
export function compareTerms(a, b) {
  const key = (t) => {
    const m = /^(\d+)([SA])(\d+)$/i.exec(t);
    return m ? [Number(m[1]), m[2].toUpperCase() === 'S' ? 0 : 1, Number(m[3])] : [Infinity, 0, 0];
  };
  const ka = key(a);
  const kb = key(b);
  for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
  return collator.compare(a, b);
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listJsonFiles(abs));
    else if (e.isFile() && e.name.toLowerCase().endsWith('.json')) out.push(abs);
  }
  return out.sort((a, b) => collator.compare(a, b));
}

/** 問題バンクの全ファイルを読む。壊れたファイルは error 付きで返す */
export function loadBank() {
  return listJsonFiles(BANK_DIR).map((file) => {
    try {
      return { file, data: readJson(file) };
    } catch (e) {
      return { file, error: e.message };
    }
  });
}

/** 問題バンク内での保存場所: quiz-bank/<学期>/<科目>/<materialId>.json */
export const bankPathFor = (term, subject, materialId) => path.join(BANK_DIR, term, subject, `${materialId}.json`);

/** 今日の日付（日本時間の YYYY-MM-DD） */
export function today() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
}
