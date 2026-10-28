// 暗号化された問題データを取得・復号して、使いやすい形にまとめる
import { deriveKeyBytes, importKey, decryptJson, checkKey, b64ToBytes, bytesToB64 } from './crypto.js';
import { getStoredKey, setStoredKey } from './store.js';

const DATA_CACHE = 'yq-data';

export async function fetchMeta() {
  const res = await fetch('data/meta.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`meta.json を取得できません（${res.status}）`);
  return res.json();
}

/** この端末に記憶した鍵が今のデータに使えれば返す */
export async function keyFromStorage(meta) {
  const saved = getStoredKey();
  if (!saved || saved.salt !== meta.kdf.salt || saved.iterations !== meta.kdf.iterations) return null;
  const key = await importKey(b64ToBytes(saved.key));
  return (await checkKey(key, meta.check)) ? key : null;
}

/** パスワードから鍵を作り、正しければ端末に記憶する */
export async function unlock(meta, password) {
  const raw = await deriveKeyBytes(password, meta.kdf);
  const key = await importKey(raw);
  if (!(await checkKey(key, meta.check))) return null;
  setStoredKey({ key: bytesToB64(raw), salt: meta.kdf.salt, iterations: meta.kdf.iterations });
  return key;
}

async function fetchEncrypted(name) {
  const res = await fetch(`data/${name}`);
  if (!res.ok) throw new Error(`データを取得できません（${res.status}）`);
  return new Uint8Array(await res.arrayBuffer());
}

/** 使わなくなった古いデータをオフライン用の保存領域から消す */
async function pruneCache(keepNames) {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(DATA_CACHE);
    for (const req of await cache.keys()) {
      const name = new URL(req.url).pathname.split('/').pop();
      if (!keepNames.has(name)) await cache.delete(req);
    }
  } catch {
    // 失敗しても動作には影響しない
  }
}

/**
 * すべての問題を読み込む。
 * 戻り値: { subjects: [{ key, term, subject, materials }], materials: Map, questions: Map }
 * 問題には mid（資料ID）・term・subject・key（学期/科目）を付け足す。
 */
export async function loadData(key, meta) {
  const catalog = await decryptJson(key, await fetchEncrypted(meta.catalog));
  const keep = new Set(['meta.json', meta.catalog]);
  const entries = catalog.terms.flatMap((t) => t.subjects.map((s) => ({ term: t.term, ...s })));
  const bundles = await Promise.all(entries.map(async (s) => {
    keep.add(s.bundle);
    return decryptJson(key, await fetchEncrypted(s.bundle));
  }));
  pruneCache(keep);

  const subjects = [];
  const materials = new Map();
  const questions = new Map();
  bundles.forEach((b) => {
    const subjectKey = `${b.term}/${b.subject}`;
    const mats = b.materials.slice().sort((x, y) => x.order - y.order);
    for (const m of mats) {
      m.term = b.term;
      m.subject = b.subject;
      m.key = subjectKey;
      materials.set(m.id, m);
      for (const q of m.questions) {
        q.mid = m.id;
        q.term = b.term;
        q.subject = b.subject;
        q.key = subjectKey;
        questions.set(q.id, q);
      }
    }
    subjects.push({ key: subjectKey, term: b.term, subject: b.subject, materials: mats });
  });
  return { meta, subjects, materials, questions, terms: catalog.terms.map((t) => t.term) };
}
