// クイズ画面と結果画面
import { h, toast, dayNumber, shuffle, percent } from '../util.js';
import { store } from '../store.js';
import { app, navigate } from '../app.js';
import { grade } from '../srs.js';
import { rich } from '../render.js';

export const TYPE_LABELS = { single: '4択', truefalse: '○×', flashcard: '一問一答', kokushi: '国試形式' };
const MARKS = ['①', '②', '③', '④'];
const REASONS = ['内容が誤っている', '問題文や選択肢があいまい', '解説が不十分', 'その他'];

/** クイズを始める。practice=true のときは学習記録（復習の予定）を変えない */
export function startSession(kind, ids, { title = '', practice = false } = {}) {
  const queue = ids.filter((id) => app.db.questions.has(id)).map((id) => ({ id, practice }));
  if (!queue.length) { toast('出題できる問題がありません'); return; }
  app.session = { kind, title, queue, index: 0, answers: [], retryAdded: false };
  navigate('#/quiz');
}

function record(q, result, practice) {
  if (practice) return;
  const today = dayNumber();
  grade(store.progress, q.id, result, today);
  const day = (store.stats.days[today] ||= { n: 0, c: 0 });
  day.n += 1;
  if (result === 'correct') day.c += 1;
  const daily = store.daily;
  if (daily?.day === today && daily.ids.includes(q.id) && !(q.id in daily.results)) daily.results[q.id] = result[0];
  store.fresh = store.fresh.filter((id) => id !== q.id);
  store.save('progress', 'stats', 'daily', 'fresh');
}

function finish() {
  const s = app.session;
  app.session = null;
  if (!s || !s.answers.length) { navigate('#/'); return; }
  app.lastResult = { title: s.title, answers: s.answers };
  navigate('#/result');
}

function next() {
  const s = app.session;
  s.index += 1;
  // 最後まで解いたら、間違えた問題をその場でもう一度（記録は変えない）
  if (s.index >= s.queue.length && !s.retryAdded) {
    s.retryAdded = true;
    const wrong = [...new Set(s.answers.filter((a) => !a.practice && a.result !== 'correct').map((a) => a.id))];
    if (wrong.length && s.kind !== 'retry') {
      s.queue.push(...shuffle(wrong).map((id) => ({ id, practice: true })));
      toast(`間違えた ${wrong.length} 問をもう一度出します`);
    }
  }
  if (s.index >= s.queue.length) finish();
  else app.render();
}

function sourceLine(q) {
  const m = app.db.materials.get(q.mid);
  const pages = q.pages?.length ? ` p.${q.pages.join(', ')}` : '';
  return h('p', { class: 'source' }, `出典: ${q.subject}｜${m.title}${pages}`);
}

function reportForm(q) {
  const reason = h('select', { class: 'input', 'aria-label': '報告の理由' }, REASONS.map((r) => h('option', null, r)));
  const comment = h('textarea', { class: 'input', rows: '2', placeholder: '気づいたこと（なくても可）' });
  const form = h('div', { class: 'report-form stack' }, reason, comment,
    h('button', {
      class: 'btn',
      onclick: () => {
        store.reports.push({ id: q.id, reason: reason.value, comment: comment.value.trim(), at: new Date().toISOString() });
        store.save('reports');
        form.replaceWith(h('p', { class: 'muted small' }, '報告を保存しました。設定画面の「報告をコピー」から Claude に渡すと修正されます。'));
      },
    }, '報告を保存'));
  return form;
}

function tools(q) {
  const star = h('button', { class: 'chip-btn', 'aria-pressed': String(Boolean(store.bookmarks[q.id])) });
  const paintStar = () => { star.textContent = store.bookmarks[q.id] ? '★ ブックマーク済み' : '☆ ブックマーク'; };
  paintStar();
  star.addEventListener('click', () => {
    if (store.bookmarks[q.id]) delete store.bookmarks[q.id];
    else store.bookmarks[q.id] = true;
    store.save('bookmarks');
    star.setAttribute('aria-pressed', String(Boolean(store.bookmarks[q.id])));
    paintStar();
  });
  const row = h('div', { class: 'tools' }, star);
  const report = h('button', { class: 'chip-btn', onclick: () => { report.remove(); row.after(reportForm(q)); } }, '⚑ 問題を報告');
  row.append(report);
  return row;
}

function explanationBlock(q) {
  return [h('div', { class: 'label' }, '解説'), rich(q.explanation, 'div', 'explanation'), sourceLine(q), tools(q)];
}

function nextButton(isLast) {
  return h('button', { class: 'btn primary block next', onclick: next }, isLast ? '結果を見る' : '次へ');
}

/** 4択・国試形式（国試形式は本番と同じく番号を固定し、解説の番号と一致させる） */
function choiceUI(q, area, onAnswer) {
  const kokushi = q.type === 'kokushi';
  const need = kokushi ? q.selectCount : 1;
  const indices = q.choices.map((_, i) => i);
  const order = !kokushi && store.settings.shuffle && q.shuffle !== false ? shuffle(indices) : indices;
  const label = (pos) => (kokushi ? String(pos + 1) : MARKS[pos]);
  const selected = new Set();
  let answered = false;

  const submit = () => {
    answered = true;
    const correct = q.answer.length === selected.size && q.answer.every((a) => selected.has(a));
    buttons.forEach((b, pos) => {
      const ci = order[pos];
      b.disabled = true;
      if (q.answer.includes(ci)) b.classList.add('correct');
      else if (selected.has(ci)) b.classList.add('wrong');
    });
    submitBtn?.remove();
    const right = order.map((ci, pos) => (q.answer.includes(ci) ? label(pos) : null)).filter(Boolean).join(' と ');
    onAnswer(correct ? 'correct' : 'wrong', kokushi ? `正解は ${right}` : `正解は ${right} ${q.choices[q.answer[0]]}`);
  };

  const buttons = order.map((ci, pos) => h('button', {
    class: 'choice',
    onclick: (e) => {
      if (answered) return;
      if (need === 1) { selected.add(ci); submit(); return; }
      const btn = e.currentTarget;
      if (selected.has(ci)) selected.delete(ci);
      else if (selected.size < need) selected.add(ci);
      btn.classList.toggle('selected', selected.has(ci));
      submitBtn.disabled = selected.size !== need;
    },
  }, h('span', { class: 'mark' }, label(pos)), rich(q.choices[ci], 'span', 'choice-text')));

  const submitBtn = need > 1 ? h('button', { class: 'btn primary block', disabled: true, onclick: submit }, `${need}つ選んで解答する`) : null;
  area.append(...buttons);
  if (submitBtn) area.append(submitBtn);
}

/** ○× */
function trueFalseUI(q, area, onAnswer) {
  const pick = (value) => {
    area.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const btn = area.querySelector(value ? '.tf-true' : '.tf-false');
    btn.classList.add(value === q.answer ? 'correct' : 'wrong');
    if (value !== q.answer) area.querySelector(q.answer ? '.tf-true' : '.tf-false').classList.add('correct');
    onAnswer(value === q.answer ? 'correct' : 'wrong', `この文は${q.answer ? '正しい（○）' : '誤り（×）'}`);
  };
  area.append(h('div', { class: 'tf-row' },
    h('button', { class: 'choice tf tf-true', onclick: () => pick(true) }, h('span', { class: 'tf-mark' }, '○'), '正しい'),
    h('button', { class: 'choice tf tf-false', onclick: () => pick(false) }, h('span', { class: 'tf-mark' }, '×'), '誤り')));
}

/** 一問一答（答えを見てから自己評価） */
function flashcardUI(q, area, feedback, onRate, isLast) {
  const reveal = h('button', {
    class: 'btn primary block',
    onclick: () => {
      reveal.remove();
      feedback.append(h('div', { class: 'feedback reveal' },
        h('div', { class: 'label' }, '答え'),
        rich(q.answerText, 'div', 'answer-text'),
        ...explanationBlock(q),
        h('p', { class: 'muted small center' }, '思い出せましたか？'),
        h('div', { class: 'rate-row' },
          h('button', { class: 'btn rate wrong', onclick: () => onRate('wrong') }, '忘れた'),
          h('button', { class: 'btn rate unsure', onclick: () => onRate('unsure') }, 'あやふや'),
          h('button', { class: 'btn rate ok', onclick: () => onRate('correct') }, isLast ? '覚えた（結果へ）' : '覚えた'))));
      feedback.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  }, '答えを見る');
  area.append(reveal);
}

export function renderQuiz() {
  const s = app.session;
  if (!s) { setTimeout(() => navigate('#/')); return h('div'); }
  const item = s.queue[s.index];
  const q = app.db.questions.get(item.id);
  if (!q) {
    // 解いている途中でデータが更新され、問題が無くなっていた場合は飛ばす
    s.queue.splice(s.index, 1);
    if (s.index >= s.queue.length) { setTimeout(finish); return h('div'); }
    return renderQuiz();
  }
  const isLast = s.index === s.queue.length - 1;

  const area = h('div', { class: 'answer-area stack' });
  const feedback = h('div', { class: 'feedback-area' });
  const answer = (result) => {
    record(q, result, item.practice);
    s.answers.push({ id: q.id, result, practice: item.practice });
  };

  if (q.type === 'flashcard') {
    flashcardUI(q, area, feedback, (result) => { answer(result); next(); }, isLast);
  } else {
    const onAnswer = (result, rightText) => {
      answer(result);
      const ok = result === 'correct';
      feedback.append(h('div', { class: `feedback ${ok ? 'ok' : 'ng'}` },
        h('div', { class: 'verdict' }, ok ? '正解！' : '不正解'),
        !ok && rich(rightText, 'p', 'right'),
        ...explanationBlock(q),
        nextButton(isLast)));
      feedback.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    if (q.type === 'truefalse') trueFalseUI(q, area, onAnswer);
    else choiceUI(q, area, onAnswer);
  }

  return h('main', { class: 'screen quiz' },
    h('div', { class: 'quiz-top' },
      h('button', { class: 'icon-btn', 'aria-label': 'やめる', onclick: finish }, '✕'),
      h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': String(s.index), 'aria-valuemax': String(s.queue.length) },
        h('span', { style: `width:${percent(s.index, s.queue.length)}%` })),
      h('span', { class: 'count' }, `${s.index + 1}/${s.queue.length}`)),
    h('div', { class: 'chips' },
      h('span', { class: 'chip' }, q.subject),
      h('span', { class: `chip type-${q.type}` }, TYPE_LABELS[q.type]),
      item.practice && h('span', { class: 'chip warn' }, 'もう一度')),
    h('section', { class: 'card question' }, rich(q.question, 'div', 'q-text')),
    area,
    feedback);
}

export function renderResult() {
  const r = app.lastResult;
  if (!r) { setTimeout(() => navigate('#/')); return h('div'); }
  const main = r.answers.filter((a) => !a.practice);
  const correct = main.filter((a) => a.result === 'correct').length;
  const wrongIds = [...new Set(main.filter((a) => a.result !== 'correct').map((a) => a.id))];
  const resultLabel = { correct: '○', wrong: '×', unsure: '△' };

  const items = main.map((a) => {
    const q = app.db.questions.get(a.id);
    if (!q) return null;
    const answerText = q.type === 'flashcard' ? q.answerText
      : q.type === 'truefalse' ? (q.answer ? '○（正しい）' : '×（誤り）')
        : q.answer.map((i) => q.choices[i]).join(' / ');
    return h('details', { class: `result-item r-${a.result}` },
      h('summary', null, h('span', { class: 'r-mark' }, resultLabel[a.result]), rich(q.question, 'span', 'r-q')),
      h('div', { class: 'label' }, '答え'),
      rich(answerText, 'div', 'answer-text'),
      h('div', { class: 'label' }, '解説'),
      rich(q.explanation, 'div', 'explanation'),
      sourceLine(q));
  });

  return h('main', { class: 'screen' },
    h('h1', null, 'おつかれさまでした'),
    h('div', { class: 'card score' },
      h('div', { class: 'score-num' }, `${correct}`, h('small', null, ` / ${main.length} 問正解`)),
      h('div', { class: 'muted' }, `正答率 ${percent(correct, main.length)}%`)),
    h('div', { class: 'stack' },
      wrongIds.length > 0 && h('button', { class: 'btn block', onclick: () => startSession('retry', wrongIds, { title: '間違えた問題', practice: true }) }, `間違えた ${wrongIds.length} 問をもう一度`),
      h('button', { class: 'btn primary block', onclick: () => navigate('#/') }, 'ホームへ')),
    h('h2', null, '振り返り'),
    h('div', { class: 'result-list' }, items));
}
