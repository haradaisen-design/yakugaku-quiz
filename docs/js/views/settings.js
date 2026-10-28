// 設定画面
import { h, toast, dayNumber } from '../util.js';
import { store, exportData, importData, clearStoredKey } from '../store.js';
import { app } from '../app.js';
import { buildDaily } from '../daily.js';
import { header } from './home.js';
import { TYPE_LABELS } from './quiz.js';

function saveSettings() {
  store.save('settings');
}

/** 設定を変えたあと、解き終えた分は残して今日のクイズを選び直す */
function rebuildDaily() {
  const today = dayNumber();
  const answered = store.daily?.day === today ? store.daily.results : {};
  const done = Object.keys(answered);
  const fresh = buildDaily(app.db, store, today).ids.filter((id) => !(id in answered));
  store.daily = { day: today, ids: [...done, ...fresh.slice(0, Math.max(0, store.settings.dailyCount - done.length))], results: answered };
  store.save('daily');
  toast('今日のクイズを選び直しました');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', null, text);
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

function reportText() {
  const lines = store.reports.map((r) => {
    const q = app.db.questions.get(r.id);
    const where = q ? `${q.subject}｜${app.db.materials.get(q.mid).title}` : '（現在は存在しない問題）';
    const text = q ? q.question.replace(/\s+/g, ' ').slice(0, 50) : '';
    return `- ${r.id}（${where}）\n  理由: ${r.reason}${r.comment ? `\n  コメント: ${r.comment}` : ''}\n  問題文: ${text}`;
  });
  return `/quiz-fix\n【薬学クイズ アプリからの報告 ${store.reports.length}件】\n${lines.join('\n')}`;
}

function checkbox(label, checked, onchange) {
  return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked, onchange: (e) => onchange(e.target.checked) }), h('span', null, label));
}

export function renderSettings() {
  const s = store.settings;
  const db = app.db;

  const count = h('select', {
    class: 'input',
    onchange: (e) => { s.dailyCount = Number(e.target.value); saveSettings(); },
  }, [10, 20, 30, 50, 80].map((n) => h('option', { value: String(n), selected: n === s.dailyCount }, `${n}問`)));

  const types = Object.entries(TYPE_LABELS).map(([t, label]) =>
    checkbox(label, s.types[t] !== false, (v) => { s.types[t] = v; saveSettings(); }));

  const terms = db.terms.map((t) => checkbox(t, !s.terms || s.terms.includes(t), (v) => {
    const set = new Set(s.terms || db.terms);
    if (v) set.add(t); else set.delete(t);
    s.terms = set.size === db.terms.length ? null : [...set];
    saveSettings();
  }));

  const subjects = db.subjects.map((sub) => checkbox(`${sub.subject}（${sub.term}）`, !s.excludedSubjects.includes(sub.key), (v) => {
    s.excludedSubjects = v ? s.excludedSubjects.filter((k) => k !== sub.key) : [...s.excludedSubjects, sub.key];
    saveSettings();
  }));

  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'hidden',
    onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        importData(await file.text());
        toast('学習記録を読み込みました');
        setTimeout(() => location.reload(), 800);
      } catch (err) {
        toast(`読み込めませんでした: ${err.message}`);
      }
    },
  });

  const exportBackup = async () => {
    const name = `yakugaku-quiz-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([exportData()], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: '薬学クイズのバックアップ' }); } catch { /* キャンセル */ }
      return;
    }
    const a = h('a', { href: URL.createObjectURL(file), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const total = db.questions.size;
  return h('main', { class: 'screen' }, header('設定', '#/'),
    h('section', { class: 'card stack' },
      h('h2', null, '出題'),
      h('label', { class: 'field' }, h('span', null, '今日のクイズの問題数'), count),
      checkbox('4択の選択肢の順番を毎回入れ替える', s.shuffle, (v) => { s.shuffle = v; saveSettings(); }),
      h('div', { class: 'label' }, '出題する形式'), h('div', { class: 'checks' }, types),
      terms.length > 1 && [h('div', { class: 'label' }, '出題する学期'), h('div', { class: 'checks' }, terms)],
      h('div', { class: 'label' }, '出題する科目'), h('div', { class: 'checks' }, subjects),
      h('button', { class: 'btn block', onclick: rebuildDaily }, '今の設定で今日のクイズを選び直す')),

    h('section', { class: 'card stack' },
      h('h2', null, '問題の報告'),
      h('p', { class: 'muted small' }, `保存した報告: ${store.reports.length}件。「報告をコピー」して PC の Claude Code に貼り付けると、問題が修正されます（LINE などで自分に送ってから PC で貼り付けてもOK）。`),
      h('div', { class: 'row' },
        h('button', { class: 'btn', disabled: !store.reports.length, onclick: async () => { await copyText(reportText()); toast('報告をコピーしました'); } }, '報告をコピー'),
        h('button', {
          class: 'btn ghost',
          disabled: !store.reports.length,
          onclick: () => { if (confirm('保存した報告をすべて消しますか？')) { store.reports = []; store.save('reports'); app.render(); } },
        }, '報告を消す'))),

    h('section', { class: 'card stack' },
      h('h2', null, '学習記録のバックアップ'),
      h('p', { class: 'muted small' }, '学習記録はこの端末だけに保存されています。機種変更や、ブラウザのデータ削除に備えて、ときどき書き出しておくと安心です。'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: exportBackup }, '書き出す'),
        h('button', { class: 'btn', onclick: () => fileInput.click() }, '読み込む')),
      fileInput),

    h('section', { class: 'card stack' },
      h('h2', null, 'このアプリについて'),
      h('p', { class: 'small' }, `問題 ${total}問 / 資料 ${db.materials.size}件 / データ版 ${db.meta.dataVersion}`),
      h('button', { class: 'btn block', onclick: () => location.reload() }, '最新のデータを確認する'),
      h('button', {
        class: 'btn ghost block',
        onclick: () => { if (confirm('この端末に記憶したパスワードを消しますか？（学習記録は消えません）')) { clearStoredKey(); location.reload(); } },
      }, 'この端末のパスワードを消す')));
}
