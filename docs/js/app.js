// 画面どうしで共有する状態と画面移動
export const app = {
  db: null, // 読み込んだ問題データ（data.js の loadData の戻り値）
  session: null, // 解いている最中のクイズ
  lastResult: null, // 直前のクイズの結果
  render: () => {},
};

/** 画面を移動する（同じ画面なら描き直す） */
export function navigate(hash) {
  const current = location.hash || '#/';
  if (current === hash) app.render();
  else location.hash = hash;
}
