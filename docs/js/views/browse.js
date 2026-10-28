// 科目ごとの資料一覧と、資料ごとの画面（要点の一覧・その資料だけを解く）
import { h, shuffle, dayNumber } from '../util.js';
import { store } from '../store.js';
import { app, navigate } from '../app.js';
import { isMastered } from '../srs.js';
import { rich } from '../render.js';
import { header, progressBar } from './home.js';
import { startSession, TYPE_LABELS } from './quiz.js';

function summary(questions) {
  const seen = questions.filter((q) => store.progress[q.id]).length;
  const mastered = questions.filter((q) => isMastered(store.progress[q.id])).length;
  return { seen, mastered, total: questions.length };
}

export function renderSubject(term, subject) {
  const s = app.db.subjects.find((x) => x.term === term && x.subject === subject);
  if (!s) { setTimeout(() => navigate('#/')); return h('div'); }
  const all = s.materials.flatMap((m) => m.questions);
  const today = dayNumber();
  // 科目から10問: 復習の期限が来た問題 → まだ解いていない問題 の順に選ぶ
  const pick = () => {
    const due = all.filter((q) => store.progress[q.id] && store.progress[q.id].d <= today);
    const unseen = all.filter((q) => !store.progress[q.id]);
    return [...shuffle(due), ...unseen].slice(0, 10).map((q) => q.id);
  };
  return h('main', { class: 'screen' }, header(subject, '#/'),
    h('p', { class: 'muted center' }, `${term}｜資料 ${s.materials.length}件｜${all.length}問`),
    h('button', {
      class: 'btn primary block',
      onclick: () => {
        const ids = pick();
        startSession('subject', ids.length ? ids : shuffle(all.map((q) => q.id)).slice(0, 10), { title: subject });
      },
    }, 'この科目から10問'),
    h('section', { class: 'card list' }, s.materials.map((m) => {
      const sm = summary(m.questions);
      return h('button', { class: 'subject-row', onclick: () => navigate(`#/material/${m.id}`) },
        h('div', { class: 'subject-name' }, h('span', null, m.title)),
        progressBar(sm.mastered, sm.total, 'thin'),
        h('div', { class: 'muted tiny' }, `${sm.total}問　解いた ${sm.seen}　習得 ${sm.mastered}　追加 ${m.generatedAt}`));
    })));
}

export function renderMaterial(id) {
  const m = app.db.materials.get(id);
  if (!m) { setTimeout(() => navigate('#/')); return h('div'); }
  const qs = m.questions;
  const sm = summary(qs);
  const unseen = qs.filter((q) => !store.progress[q.id]).map((q) => q.id);
  const wrong = qs.filter((q) => store.progress[q.id]?.r === 'w').map((q) => q.id);
  const types = Object.entries(TYPE_LABELS).map(([t, label]) => `${label}${qs.filter((q) => q.type === t).length}`).join('・');
  const back = `#/subject/${encodeURIComponent(m.term)}/${encodeURIComponent(m.subject)}`;

  return h('main', { class: 'screen' }, header(m.subject, back),
    h('section', { class: 'card' },
      h('h2', null, m.title),
      h('p', { class: 'muted small' }, `${m.source}｜追加 ${m.generatedAt}${m.updatedAt !== m.generatedAt ? `（更新 ${m.updatedAt}）` : ''}`),
      h('p', { class: 'small' }, `${sm.total}問（${types}）　解いた ${sm.seen}　習得 ${sm.mastered}`),
      progressBar(sm.mastered, sm.total)),
    h('div', { class: 'stack' },
      h('button', { class: 'btn primary block', onclick: () => startSession('material', qs.map((q) => q.id), { title: m.title }) }, `全部解く（${qs.length}問）`),
      unseen.length > 0 && h('button', { class: 'btn block', onclick: () => startSession('material', unseen, { title: m.title }) }, `まだ解いていない問題（${unseen.length}問）`),
      wrong.length > 0 && h('button', { class: 'btn block', onclick: () => startSession('material', wrong, { title: m.title }) }, `前回間違えた問題（${wrong.length}問）`)),
    h('h2', { class: 'section-title' }, 'この資料の要点'),
    h('section', { class: 'card' }, h('ol', { class: 'keypoints' }, m.keyPoints.map((k) => h('li', null,
      rich(k.text, 'span'), k.pages.length ? h('span', { class: 'muted tiny' }, `（p.${k.pages.join(', ')}）`) : null)))));
}
