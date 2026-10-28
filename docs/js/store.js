// 学習記録と設定をこの端末（localStorage）に保存する
const PREFIX = 'yq.';

function load(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn('保存できませんでした', e);
  }
}

export const DEFAULT_SETTINGS = {
  dailyCount: 30,
  terms: null, // null = すべての学期
  excludedSubjects: [], // "学期/科目" の形
  types: { single: true, truefalse: true, flashcard: true, kokushi: true },
  shuffle: true,
};

const KEYS = ['progress', 'settings', 'daily', 'stats', 'reports', 'bookmarks', 'known', 'fresh'];

export const store = {
  // 問題IDごとの記録 { b: 箱, d: 次に出す日, n: 回答数, c: 正解数, w: 不正解数, l: 最後に解いた日, r: 最後の結果 }
  progress: load('progress', {}),
  settings: { ...DEFAULT_SETTINGS, ...load('settings', {}) },
  daily: load('daily', null), // { day, ids, results: { id: 'c'|'w'|'u' } }
  stats: load('stats', { days: {} }), // days: { 日数: { n, c } }
  reports: load('reports', []),
  bookmarks: load('bookmarks', {}),
  known: load('known', null), // これまでに見た問題IDの一覧（新着の判定用）
  fresh: load('fresh', []), // 新着の問題ID
  save(...keys) {
    for (const k of keys) save(k, this[k]);
  },
};

export function getStoredKey() {
  return load('key', null);
}

export function setStoredKey(value) {
  save('key', value);
}

export function clearStoredKey() {
  localStorage.removeItem(PREFIX + 'key');
}

/** バックアップ用に学習記録をまとめる（パスワードの鍵は含めない） */
export function exportData() {
  const data = { app: 'yakugaku-quiz', version: 1, exportedAt: new Date().toISOString() };
  for (const k of KEYS) data[k] = store[k];
  return JSON.stringify(data);
}

export function importData(text) {
  const data = JSON.parse(text);
  if (data.app !== 'yakugaku-quiz') throw new Error('このアプリのバックアップではありません');
  for (const k of KEYS) {
    if (data[k] !== undefined) store[k] = k === 'settings' ? { ...DEFAULT_SETTINGS, ...data[k] } : data[k];
  }
  store.save(...KEYS);
}
