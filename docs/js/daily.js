// 「今日のクイズ」と各種の出題リストを作る
import { dayFromString, seededRandom, shuffle } from './util.js';
import { isWeak } from './srs.js';

const RECENT_DAYS = 7; // 追加から7日以内の資料は新しい問題として優先する

/** 設定（学期・科目・形式）で絞り込んだ出題対象 */
export function activeQuestions(db, settings) {
  const terms = settings.terms ? new Set(settings.terms) : null;
  const excluded = new Set(settings.excludedSubjects);
  return [...db.questions.values()].filter((q) =>
    (!terms || terms.has(q.term)) && !excluded.has(q.key) && settings.types[q.type] !== false);
}

/**
 * まだ解いていない問題の並び順:
 * 科目ごとに「最近追加された資料（新しい順）→ それ以外（授業の順）」に並べ、科目を順番に回して混ぜる
 */
function orderNew(db, list, today) {
  const bySubject = new Map();
  for (const q of list) {
    if (!bySubject.has(q.key)) bySubject.set(q.key, []);
    bySubject.get(q.key).push(q);
  }
  const rank = (q) => {
    const m = db.materials.get(q.mid);
    const added = dayFromString(m.generatedAt);
    return today - added <= RECENT_DAYS ? [0, -added, m.order] : [1, m.order, 0];
  };
  const queues = [...bySubject.values()].map((qs) => qs
    .map((q, i) => ({ q, r: rank(q), i }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.r[2] - b.r[2] || a.i - b.i)
    .map((x) => x.q));
  // 毎日同じ科目から始まらないよう、開始位置を日によってずらす
  const start = queues.length ? today % queues.length : 0;
  const rotated = [...queues.slice(start), ...queues.slice(0, start)];
  const out = [];
  while (rotated.some((qs) => qs.length)) for (const qs of rotated) if (qs.length) out.push(qs.shift());
  return out;
}

/** 今日のクイズ: 復習の期限が来た問題（古い順）＋新しい問題（3割以上） */
export function buildDaily(db, store, today) {
  const { progress, settings } = store;
  const pool = activeQuestions(db, settings);
  const due = pool.filter((q) => progress[q.id] && progress[q.id].d <= today)
    .sort((a, b) => progress[a.id].d - progress[b.id].d || progress[a.id].b - progress[b.id].b);
  const fresh = orderNew(db, pool.filter((q) => !progress[q.id]), today);
  const target = settings.dailyCount;
  const minNew = Math.min(fresh.length, Math.ceil(target * 0.3));
  const reviews = due.slice(0, Math.max(0, target - minNew));
  const news = fresh.slice(0, target - reviews.length);
  const ids = shuffle([...reviews, ...news], seededRandom(today)).map((q) => q.id);
  return { day: today, ids, results: {} };
}

/** 今日のクイズを解き終えたあとの追加分（新しい問題 → 近いうちに期限が来る復習 の順） */
export function buildExtra(db, store, today, count = 10) {
  const { progress, settings, daily } = store;
  const used = new Set(daily?.ids || []);
  const pool = activeQuestions(db, settings).filter((q) => !used.has(q.id));
  const fresh = orderNew(db, pool.filter((q) => !progress[q.id]), today);
  const soon = pool.filter((q) => progress[q.id]).sort((a, b) => progress[a.id].d - progress[b.id].d);
  return [...fresh, ...soon].slice(0, count).map((q) => q.id);
}

/** 今日のクイズの残り */
export function remainingDaily(db, daily) {
  if (!daily) return [];
  return daily.ids.filter((id) => !(id in daily.results) && db.questions.has(id));
}

/** 苦手な問題（間違えたことがあり、まだ定着していない） */
export function weakQuestions(db, store) {
  return activeQuestions(db, store.settings)
    .filter((q) => isWeak(store.progress[q.id]))
    .sort((a, b) => store.progress[b.id].w - store.progress[a.id].w)
    .map((q) => q.id);
}
