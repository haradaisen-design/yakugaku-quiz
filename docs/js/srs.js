// 間隔反復: 正解するほど次に出す日を先に延ばし、間違えたら翌日にもう一度出す
export const INTERVALS = [0, 1, 3, 7, 14, 30, 60, 120]; // 箱ごとの間隔（日）
export const MASTERED_BOX = 4; // 14日以上あけても覚えていれば「習得」

/** result: 'correct'（正解・覚えた） / 'wrong'（不正解・忘れた） / 'unsure'（あやふや） */
export function grade(progress, id, result, today) {
  const p = progress[id] || { b: 0, n: 0, c: 0, w: 0 };
  if (result === 'correct') {
    // 初めて見て正解した問題は、少しあけて3日後に確認する
    p.b = p.n === 0 ? 2 : Math.min(p.b + 1, INTERVALS.length - 1);
    p.c += 1;
    p.d = today + INTERVALS[p.b];
  } else if (result === 'wrong') {
    p.b = 1;
    p.w += 1;
    p.d = today + 1;
  } else {
    p.b = Math.max(1, p.b - 1);
    p.d = today + Math.max(1, Math.floor(INTERVALS[p.b] / 2));
  }
  p.n += 1;
  p.l = today;
  p.r = result[0];
  progress[id] = p;
  return p;
}

export const isMastered = (p) => Boolean(p && p.b >= MASTERED_BOX);
export const isWeak = (p) => Boolean(p && p.w > 0 && p.b <= 2);
