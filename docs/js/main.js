// アプリの起動と画面の切り替え
import { h, toast } from './util.js';
import { store } from './store.js';
import { app } from './app.js';
import { fetchMeta, keyFromStorage, loadData } from './data.js';
import { renderUnlock } from './views/unlock.js';
import { renderHome } from './views/home.js';
import { renderQuiz, renderResult } from './views/quiz.js';
import { renderSubject, renderMaterial } from './views/browse.js';
import { renderSettings } from './views/settings.js';

const root = document.getElementById('app');
const RECHECK_MS = 30 * 60 * 1000; // アプリに戻ってきたとき、30分以上たっていれば新しい問題を確認
let lastCheck = 0;

const routes = {
  '': renderHome,
  quiz: renderQuiz,
  result: renderResult,
  subject: renderSubject,
  material: renderMaterial,
  settings: renderSettings,
};

function show(node) {
  root.replaceChildren(node);
  window.scrollTo(0, 0);
}

function message(title, text) {
  return h('main', { class: 'screen center-screen' }, h('div', { class: 'logo' }, '薬'), h('h1', null, title), h('p', { class: 'muted' }, text));
}

app.render = () => {
  if (!app.db) return;
  const [name = '', ...params] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  if (name !== 'quiz') app.session = null;
  show((routes[name] || renderHome)(...params));
};

/** 新しく増えた問題を「新着」として記録する */
function trackFresh() {
  const ids = [...app.db.questions.keys()];
  if (store.known) {
    const known = new Set(store.known);
    store.fresh = [...new Set([...store.fresh, ...ids.filter((id) => !known.has(id))])];
  }
  store.known = ids;
  store.fresh = store.fresh.filter((id) => app.db.questions.has(id) && !store.progress[id]);
  store.save('known', 'fresh');
}

async function start(meta, key) {
  show(message('読み込み中…', '問題データを準備しています'));
  try {
    app.db = await loadData(key, meta);
  } catch (e) {
    show(message('読み込めませんでした', `インターネットに接続してから、もう一度開いてください。（${e.message}）`));
    return;
  }
  lastCheck = Date.now();
  trackFresh();
  navigator.storage?.persist?.().catch(() => {});
  app.render();
}

async function boot() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then((reg) => reg.update()).catch(() => {});
  }
  let meta;
  try {
    meta = await fetchMeta();
  } catch {
    show(message('読み込めませんでした', 'インターネットに接続してから、もう一度開いてください。'));
    return;
  }
  const key = await keyFromStorage(meta).catch(() => null);
  if (key) start(meta, key);
  else show(renderUnlock(meta, (k) => start(meta, k)));
}

window.addEventListener('hashchange', () => app.render());

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !app.db || Date.now() - lastCheck < RECHECK_MS) return;
  lastCheck = Date.now();
  try {
    const meta = await fetchMeta();
    if (meta.dataVersion === app.db.meta.dataVersion) return;
    const key = await keyFromStorage(meta);
    if (!key) { location.reload(); return; }
    app.db = await loadData(key, meta);
    trackFresh();
    if (!app.session) app.render();
    toast('新しい問題データを読み込みました');
  } catch {
    // オフラインなどで確認できなければ、そのまま使い続ける
  }
});

boot();
