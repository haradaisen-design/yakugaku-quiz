// 問題文・解説の表示（**太字**、改行、$数式$ と $\ce{化学式}$ に対応）
const MATH = /\$|\\\(|\\\[/;
let katexReady = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.append(s);
  });
}

/** 数式を含む問題を表示するときだけ、同梱の KaTeX を読み込む */
function loadKatex() {
  katexReady ||= (async () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'vendor/katex/katex.min.css';
    document.head.append(link);
    await loadScript('vendor/katex/katex.min.js');
    await loadScript('vendor/katex/contrib/mhchem.min.js');
    await loadScript('vendor/katex/contrib/auto-render.min.js');
  })();
  return katexReady;
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function rich(text, tag = 'div', className = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.innerHTML = escapeHtml(String(text ?? ''))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
  if (MATH.test(el.textContent)) {
    loadKatex()
      .then(() => window.renderMathInElement(el, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true },
        ],
        throwOnError: false,
      }))
      .catch(() => {});
  }
  return el;
}
