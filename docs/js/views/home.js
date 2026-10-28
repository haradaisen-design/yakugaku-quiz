// ホーム画面
import { h, dayNumber, percent, shuffle } from '../util.js';
import { store } from '../store.js';
import { app, navigate } from '../app.js';
import { activeQuestions, buildDaily, buildExtra, remainingDaily, weakQuestions } from '../daily.js';
import { isMastered } from '../srs.js';
import { startSession } from './quiz.js';

const QUICK = 5; // 隙間時間用の1回分

/** 今日のクイズを用意する（日付が変わっていたら作り直す） */
export function ensureDaily(today = dayNumber()) {
  if (!store.daily || store.daily.day !== today) {
    store.daily = buildDaily(app.db, store, today);
    store.save('daily');
  }
  return store.daily;
}

function streak(today) {
  let day = store.stats.days[today]?.n ? today : today - 1;
  let n = 0;
  while (store.stats.days[day]?.n) { n += 1; day -= 1; }
  return n;
}

export function header(title = '薬学クイズ', back = null) {
  return h('header', { class: 'topbar' },
    back ? h('button', { class: 'icon-btn', 'aria-label': '戻る', onclick: () => navigate(back) }, '‹') : h('span', { class: 'logo small', 'aria-hidden': 'true' }, '薬'),
    h('h1', null, title),
    back ? h('span', { class: 'icon-btn spacer' }) : h('button', { class: 'icon-btn', 'aria-label': '設定', onclick: () => navigate('#/settings') }, '⚙'));
}

function stat(label, value) {
  return h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, value), h('div', { class: 'stat-label' }, label));
}

export function progressBar(done, total, extraClass = '') {
  return h('div', { class: `bar ${extraClass}` }, h('span', { style: `width:${percent(done, total)}%` }));
}

function dailyCard(today) {
  const daily = ensureDaily(today);
  const remaining = remainingDaily(app.db, daily);
  const total = daily.ids.filter((id) => app.db.questions.has(id)).length;
  const done = total - remaining.length;
  const card = h('section', { class: 'card daily' },
    h('div', { class: 'card-head' }, h('h2', null, '今日のクイズ'), h('span', { class: 'count' }, `${done} / ${total} 問`)),
    progressBar(done, total));
  if (!total) {
    card.append(h('p', { class: 'muted' }, '今日出せる問題がありません。設定の「出題する学期・科目・形式」を確認してください。'));
  } else if (remaining.length) {
    card.append(h('div', { class: 'stack' },
      h('button', { class: 'btn primary block big', onclick: () => startSession('daily', remaining.slice(0, QUICK), { title: '今日のクイズ' }) }, `続きを${Math.min(QUICK, remaining.length)}問`),
      remaining.length > QUICK && h('button', { class: 'btn block', onclick: () => startSession('daily', remaining, { title: '今日のクイズ' }) }, `残り全部（${remaining.length}問）`)));
  } else {
    card.append(h('p', { class: 'done' }, '今日の分は完了です！'),
      h('button', {
        class: 'btn block',
        onclick: () => {
          const extra = buildExtra(app.db, store, today);
          if (!extra.length) return;
          daily.ids.push(...extra);
          store.save('daily');
          startSession('daily', extra, { title: '今日のクイズ（追加）' });
        },
      }, 'もっと解く（10問）'));
  }
  return card;
}

function freshCard() {
  const fresh = store.fresh.filter((id) => app.db.questions.has(id));
  if (!fresh.length) return null;
  const subjects = [...new Set(fresh.map((id) => app.db.questions.get(id).subject))];
  return h('section', { class: 'card fresh' },
    h('h2', null, `新しい問題が ${fresh.length} 問あります`),
    h('p', { class: 'muted small' }, subjects.join('、')),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: () => startSession('fresh', fresh.slice(0, QUICK), { title: '新しい問題' }) }, `新着を${Math.min(QUICK, fresh.length)}問`),
      h('button', { class: 'btn ghost', onclick: () => { store.fresh = []; store.save('fresh'); app.render(); } }, '閉じる')));
}

export function renderHome() {
  const db = app.db;
  if (!db.questions.size) {
    return h('main', { class: 'screen' }, header(),
      h('section', { class: 'card empty' },
        h('h2', null, 'まだ問題がありません'),
        h('p', null, 'PC の「薬学部授業資料」フォルダに授業資料を入れると、クイズが作られてここに表示されます。')));
  }
  const today = dayNumber();
  const pool = activeQuestions(db, store.settings);
  const mastered = pool.filter((q) => isMastered(store.progress[q.id])).length;
  const unseen = pool.filter((q) => !store.progress[q.id]).length;
  const todayStat = store.stats.days[today] || { n: 0, c: 0 };
  const weak = weakQuestions(db, store);
  const bookmarks = Object.keys(store.bookmarks).filter((id) => db.questions.has(id));

  const subjects = db.subjects.map((s) => {
    const qs = s.materials.flatMap((m) => m.questions);
    const m = qs.filter((q) => isMastered(store.progress[q.id])).length;
    const seen = qs.filter((q) => store.progress[q.id]).length;
    return h('button', { class: 'subject-row', onclick: () => navigate(`#/subject/${encodeURIComponent(s.term)}/${encodeURIComponent(s.subject)}`) },
      h('div', { class: 'subject-name' }, h('span', null, s.subject), h('span', { class: 'chip tiny' }, s.term)),
      progressBar(m, qs.length, 'thin'),
      h('div', { class: 'muted tiny' }, `習得 ${m} / ${qs.length}　解いた ${seen}`));
  });

  return h('main', { class: 'screen' }, header(),
    freshCard(),
    dailyCard(today),
    h('section', { class: 'stats' },
      stat('連続', `${streak(today)}日`),
      stat('今日', `${todayStat.n}問`),
      stat('正答率', todayStat.n ? `${percent(todayStat.c, todayStat.n)}%` : '—'),
      stat('習得', `${mastered}/${pool.length}`),
      stat('未出題', `${unseen}問`)),
    h('section', { class: 'actions' },
      h('button', { class: 'btn', disabled: !weak.length, onclick: () => startSession('weak', shuffle(weak).slice(0, 10), { title: '苦手の復習' }) }, `苦手を復習（${weak.length}）`),
      h('button', { class: 'btn', disabled: !bookmarks.length, onclick: () => startSession('bookmarks', shuffle(bookmarks), { title: 'ブックマーク' }) }, `★ ブックマーク（${bookmarks.length}）`)),
    h('h2', { class: 'section-title' }, '科目'),
    h('section', { class: 'card list' }, subjects));
}
