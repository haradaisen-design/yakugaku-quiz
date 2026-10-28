// 授業資料フォルダと問題バンクを突き合わせ、新規・変更・改名・消失した資料を見つける
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  MATERIALS_DIR, WORK_DIR, BANK_DIR, collator, nfc, toPosix, readJson, writeJson, sha256, loadBank, bankPathFor,
} from './common.mjs';

/** 対応している形式（office は prepare.mjs で PDF に変換してから読む） */
export const FILE_TYPES = {
  '.pdf': 'pdf',
  '.pptx': 'office', '.ppt': 'office', '.docx': 'office', '.doc': 'office',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.gif': 'image',
  '.txt': 'text', '.md': 'text',
};

const CACHE_FILE = path.join(WORK_DIR, 'scan-cache.json');

const isIgnored = (name) => name.startsWith('.') || name.startsWith('~$') || /^(desktop\.ini|thumbs\.db)$/i.test(name);

function entries(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => !isIgnored(e.name))
    .sort((a, b) => collator.compare(a.name, b.name));
}

function filesUnder(dir) {
  const out = [];
  for (const e of entries(dir)) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...filesUnder(abs));
    else if (e.isFile()) out.push(abs);
  }
  return out;
}

const relFromMaterials = (abs) => toPosix(nfc(path.relative(MATERIALS_DIR, abs)));

function hashFile(abs) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(abs).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

function loadCache() {
  try {
    return readJson(CACHE_FILE).files || {};
  } catch {
    return {};
  }
}

/**
 * 資料の単位:
 *   <学期>/<科目>/<ファイル>   … 1ファイル = 1資料
 *   <学期>/<科目>/<フォルダ>/  … フォルダ内の全ファイルでまとめて1資料（配布物の写真が複数枚あるとき等）
 */
function collect(result) {
  const found = [];
  if (!fs.existsSync(MATERIALS_DIR)) return found;
  for (const t of entries(MATERIALS_DIR)) {
    const tAbs = path.join(MATERIALS_DIR, t.name);
    if (!t.isDirectory()) { result.misplaced.push(relFromMaterials(tAbs)); continue; }
    for (const s of entries(tAbs)) {
      const sAbs = path.join(tAbs, s.name);
      if (!s.isDirectory()) { result.misplaced.push(relFromMaterials(sAbs)); continue; }
      for (const m of entries(sAbs)) {
        const mAbs = path.join(sAbs, m.name);
        const files = m.isDirectory() ? filesUnder(mAbs) : m.isFile() ? [mAbs] : [];
        const supported = [];
        for (const f of files) {
          if (FILE_TYPES[path.extname(f).toLowerCase()]) supported.push(f);
          else result.unsupported.push(relFromMaterials(f));
        }
        if (!supported.length) continue;
        found.push({
          sourceFile: relFromMaterials(mAbs),
          term: nfc(t.name),
          subject: nfc(s.name),
          kind: m.isDirectory() ? 'folder' : 'file',
          abs: mAbs,
          files: supported,
        });
      }
    }
  }
  return found;
}

async function hashMaterials(found) {
  const cache = loadCache();
  const next = {};
  for (const mat of found) {
    const lines = [];
    mat.fileInfos = [];
    for (const f of mat.files) {
      const st = fs.statSync(f);
      const key = nfc(f);
      let c = cache[key];
      // サイズと更新日時が同じなら前回の計算結果を使う（OneDrive の未ダウンロードファイルを無駄に落とさない）
      if (!c || c.size !== st.size || c.mtimeMs !== st.mtimeMs) {
        c = { size: st.size, mtimeMs: st.mtimeMs, hash: await hashFile(f) };
      }
      next[key] = c;
      const name = mat.kind === 'folder' ? toPosix(nfc(path.relative(mat.abs, f))) : nfc(path.basename(f));
      lines.push(`${name}\t${c.hash}`);
      mat.fileInfos.push({ path: f, name, type: FILE_TYPES[path.extname(f).toLowerCase()], size: st.size, hash: c.hash });
    }
    mat.hash = mat.kind === 'file' ? mat.fileInfos[0].hash : sha256(lines.join('\n'));
  }
  writeJson(CACHE_FILE, { files: next });
}

function newMaterialId(sourceFile, usedIds) {
  const h = sha256(sourceFile);
  for (let len = 8; len <= h.length; len += 2) {
    const id = h.slice(0, len);
    if (!usedIds.has(id)) { usedIds.add(id); return id; }
  }
  throw new Error(`materialId を決められません: ${sourceFile}`);
}

function describe(mat, materialId, bankFile) {
  return {
    materialId,
    sourceFile: mat.sourceFile,
    term: mat.term,
    subject: mat.subject,
    kind: mat.kind,
    hash: mat.hash,
    bankFile: bankFile || bankPathFor(mat.term, mat.subject, materialId),
    exists: Boolean(bankFile),
    files: mat.fileInfos.map((f) => ({ name: f.name, type: f.type, path: f.path, hash: f.hash, size: f.size })),
  };
}

/** 改名・移動された資料に合わせて、問題バンクの出典パス（と保存場所）を直す */
function applyRename(r) {
  const data = readJson(r.bankFile);
  data.sourceFile = r.to;
  data.term = r.term;
  data.subject = r.subject;
  const dest = bankPathFor(r.term, r.subject, r.materialId);
  writeJson(dest, data);
  if (path.resolve(dest) !== path.resolve(r.bankFile)) fs.unlinkSync(r.bankFile);
  r.bankFile = dest;
}

export async function scanMaterials({ applyRenames = false } = {}) {
  const result = {
    materialsDir: MATERIALS_DIR,
    bankDir: BANK_DIR,
    new: [], changed: [], renamed: [], missing: [], duplicates: [], unchanged: [],
    misplaced: [], unsupported: [], brokenBankFiles: [],
  };
  const found = collect(result);
  await hashMaterials(found);

  const bank = [];
  for (const b of loadBank()) {
    if (b.error || !b.data?.materialId || !b.data?.sourceFile) { result.brokenBankFiles.push(b.file); continue; }
    bank.push({ ...b.data, file: b.file, sourceFile: nfc(b.data.sourceFile) });
  }
  const usedIds = new Set(bank.map((b) => b.materialId));
  const byPath = new Map(bank.map((b) => [b.sourceFile, b]));
  const foundPaths = new Set(found.map((m) => m.sourceFile));
  const claimed = new Set();

  for (const mat of found) {
    const entry = byPath.get(mat.sourceFile);
    if (entry) {
      result[entry.sourceHash === mat.hash ? 'unchanged' : 'changed'].push(describe(mat, entry.materialId, entry.file));
      continue;
    }
    const sameContent = bank.filter((b) => b.sourceHash === mat.hash);
    const orphan = sameContent.find((b) => !foundPaths.has(b.sourceFile) && !claimed.has(b.materialId));
    if (orphan) {
      claimed.add(orphan.materialId);
      result.renamed.push({
        from: orphan.sourceFile, to: mat.sourceFile, materialId: orphan.materialId,
        bankFile: orphan.file, term: mat.term, subject: mat.subject,
      });
      continue;
    }
    if (sameContent.length) {
      result.duplicates.push({ sourceFile: mat.sourceFile, sameAs: sameContent[0].sourceFile });
      continue;
    }
    result.new.push(describe(mat, newMaterialId(mat.sourceFile, usedIds), null));
  }

  for (const b of bank) {
    if (!foundPaths.has(b.sourceFile) && !claimed.has(b.materialId)) {
      result.missing.push({ sourceFile: b.sourceFile, materialId: b.materialId, bankFile: b.file });
    }
  }

  if (applyRenames) result.renamed.forEach(applyRename);
  return result;
}
