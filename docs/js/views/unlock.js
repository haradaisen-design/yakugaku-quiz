// パスワード入力画面
import { h } from '../util.js';
import { unlock } from '../data.js';

export function renderUnlock(meta, onUnlocked) {
  const input = h('input', {
    type: 'password', class: 'input', autocomplete: 'current-password', placeholder: 'パスワード', 'aria-label': 'パスワード',
  });
  const message = h('p', { class: 'error', role: 'alert' });
  const button = h('button', { class: 'btn primary block', type: 'submit' }, '開く');
  const form = h('form', {
    class: 'stack',
    onsubmit: async (e) => {
      e.preventDefault();
      if (!input.value) return;
      button.disabled = true;
      button.textContent = '確認中…';
      message.textContent = '';
      try {
        const key = await unlock(meta, input.value);
        if (key) { onUnlocked(key); return; }
        message.textContent = 'パスワードが違います。';
      } catch {
        message.textContent = 'この端末では開けませんでした。OS とブラウザを最新にしてお試しください。';
      }
      button.disabled = false;
      button.textContent = '開く';
    },
  }, input, message, button);

  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const hint = standalone ? null : h('div', { class: 'card hint' },
    ios
      ? 'iPhone では、先に Safari の共有ボタン（□に↑）→「ホーム画面に追加」をして、ホーム画面のアイコンから開いてからパスワードを入力してください（ホーム画面のアプリは Safari と記録が別になるため）。'
      : 'ブラウザのメニューから「ホーム画面に追加」または「アプリをインストール」をすると、アプリのように使えます。');

  return h('main', { class: 'screen unlock' },
    h('div', { class: 'logo', 'aria-hidden': 'true' }, '薬'),
    h('h1', null, '薬学クイズ'),
    hint,
    h('p', { class: 'muted' }, 'パスワードを入力してください。この端末に記憶されるので、次からは入力しなくて大丈夫です。'),
    form);
}
