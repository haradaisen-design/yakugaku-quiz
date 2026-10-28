// 問題バンクの検査（validate.mjs と build.mjs の両方で使う）
import path from 'node:path';
import { loadBank, bankPathFor, relFromRoot, nfc } from './common.mjs';

export const TYPES = ['single', 'truefalse', 'flashcard', 'kokushi'];
export const TYPE_LABELS = { single: '4択', truefalse: '○×', flashcard: '一問一答', kokushi: '国試' };

// 選択肢をシャッフルすると意味が変わるもの（「上記すべて」など）
const POSITIONAL = /上記|以上の|すべて正しい|全て正しい|いずれも|どれも|該当なし|^すべて$|^全て$/;

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isPosInt = (v) => Number.isInteger(v) && v >= 1;

/** エスケープされていない $ の数が奇数なら数式の閉じ忘れ */
const unbalancedMath = (s) => typeof s === 'string' && ((s.match(/(?<!\\)\$/g) || []).length % 2 === 1);

export function validateBank() {
  const errors = [];
  const warnings = [];
  const materials = [];
  const seenMaterialIds = new Map();
  const seenQuestionIds = new Map();

  for (const { file, data, error } of loadBank()) {
    const where = relFromRoot(file);
    const err = (msg, q) => errors.push(`${where}${q ? ` [${q}]` : ''}: ${msg}`);
    const warn = (msg, q) => warnings.push(`${where}${q ? ` [${q}]` : ''}: ${msg}`);
    if (error) { err(`JSON として読めません（${error}）`); continue; }

    const d = data;
    for (const k of ['materialId', 'term', 'subject', 'title', 'sourceFile', 'sourceHash', 'generatedAt']) {
      if (!isStr(d[k])) err(`"${k}" がありません`);
    }
    if (isStr(d.materialId) && !/^[0-9a-f]{8,}$/.test(d.materialId)) err('"materialId" は16進数8桁以上にしてください');
    if (isStr(d.generatedAt) && !/^\d{4}-\d{2}-\d{2}$/.test(d.generatedAt)) err('"generatedAt" は YYYY-MM-DD 形式にしてください');
    if (d.updatedAt !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(d.updatedAt))) err('"updatedAt" は YYYY-MM-DD 形式にしてください');
    if (isStr(d.materialId)) {
      if (seenMaterialIds.has(d.materialId)) err(`materialId が ${seenMaterialIds.get(d.materialId)} と重複しています`);
      seenMaterialIds.set(d.materialId, where);
      if (isStr(d.term) && isStr(d.subject)) {
        const expected = bankPathFor(nfc(d.term), nfc(d.subject), d.materialId);
        if (path.resolve(nfc(file)) !== path.resolve(nfc(expected))) err(`保存場所が違います（正しくは ${relFromRoot(expected)}）`);
      }
    }

    // 要点（網羅のための一覧）
    const kpIds = new Set();
    if (!Array.isArray(d.keyPoints) || d.keyPoints.length === 0) err('"keyPoints"（要点の一覧）がありません');
    else {
      d.keyPoints.forEach((kp, i) => {
        const tag = `keyPoints[${i}]`;
        if (!isStr(kp?.id) || !/^k\d+$/.test(kp.id)) err(`${tag} の id は k1, k2 … の形にしてください`);
        else if (kpIds.has(kp.id)) err(`${tag} の id "${kp.id}" が重複しています`);
        else kpIds.add(kp.id);
        if (!isStr(kp?.text)) err(`${tag} の text がありません`);
        if (!Array.isArray(kp?.pages) || !kp.pages.every(isPosInt)) err(`${tag} の pages はページ番号（1以上の整数）の配列にしてください`);
      });
    }

    // 問題
    const covered = new Set();
    const counts = Object.fromEntries(TYPES.map((t) => [t, 0]));
    if (!Array.isArray(d.questions) || d.questions.length === 0) err('"questions" がありません');
    else {
      d.questions.forEach((q, i) => {
        const id = isStr(q?.id) ? q.id : `questions[${i}]`;
        if (!isStr(q?.id) || !new RegExp(`^${d.materialId}-\\d{3,}$`).test(q.id)) err('id は "<materialId>-001" の形にしてください', id);
        else if (seenQuestionIds.has(q.id)) err(`id が ${seenQuestionIds.get(q.id)} と重複しています`, id);
        else seenQuestionIds.set(q.id, where);

        if (!TYPES.includes(q?.type)) { err(`type は ${TYPES.join(' / ')} のどれかにしてください`, id); return; }
        if (q.retired !== undefined && typeof q.retired !== 'boolean') err('retired は true / false にしてください', id);
        if (!isStr(q.question)) err('question（問題文）がありません', id);
        if (!isStr(q.explanation)) err('explanation（解説）がありません', id);
        else if (q.explanation.trim().length < 20) warn('解説が短すぎます（根拠と補足を書いてください）', id);
        if (!Array.isArray(q.keyPoints) || q.keyPoints.length === 0) err('keyPoints（対応する要点）がありません', id);
        else q.keyPoints.forEach((k) => (kpIds.has(k) ? !q.retired && covered.add(k) : err(`存在しない要点 "${k}" を指しています`, id)));
        if (!Array.isArray(q.pages) || !q.pages.every(isPosInt)) err('pages はページ番号（1以上の整数）の配列にしてください', id);
        if (![1, 2, 3].includes(q.difficulty)) err('difficulty は 1〜3 にしてください', id);
        if (q.tags !== undefined && (!Array.isArray(q.tags) || !q.tags.every(isStr))) err('tags は文字列の配列にしてください', id);
        if (q.shuffle !== undefined && typeof q.shuffle !== 'boolean') err('shuffle は true / false にしてください', id);

        if (q.type === 'single' || q.type === 'kokushi') {
          const n = q.type === 'single' ? 4 : 5;
          const label = TYPE_LABELS[q.type];
          if (!Array.isArray(q.choices) || q.choices.length !== n || !q.choices.every(isStr)) err(`${label}の choices は ${n} 個の文字列にしてください`, id);
          else {
            if (new Set(q.choices.map((c) => c.trim())).size !== n) err('同じ選択肢が重複しています', id);
            if (q.shuffle !== false && q.choices.some((c) => POSITIONAL.test(c.trim()))) {
              err('「上記すべて」など並び順に依存する選択肢があります（避けるか "shuffle": false に）', id);
            }
          }
          const want = q.type === 'single' ? 1 : q.selectCount;
          if (q.type === 'kokushi' && ![1, 2].includes(q.selectCount)) err('国試形式の selectCount は 1 か 2 にしてください', id);
          if (!Array.isArray(q.answer) || q.answer.length !== want || !q.answer.every((a) => Number.isInteger(a) && a >= 0 && a < n)
            || new Set(q.answer).size !== q.answer.length) {
            err(`answer は 0〜${n - 1} の番号を ${want} 個並べた配列にしてください`, id);
          }
          // 4択は選択肢の順番が入れ替わるため、解説で番号を使うと食い違う
          if (q.type === 'single' && q.shuffle !== false && isStr(q.explanation)
            && /[①②③④]|選択肢\s*[1-4１-４]|(^|[。\s])[1-4１-４]\s*[:：は]/.test(q.explanation)) {
            warn('4択の解説で選択肢の番号を使っています（並び順が変わるので中身で書いてください）', id);
          }
          if (q.type === 'kokushi' && [1, 2].includes(q.selectCount) && isStr(q.question)
            && !new RegExp(`[${q.selectCount}${'０１２'[q.selectCount]}]つ選べ`).test(q.question)) {
            warn(`問題文に「${q.selectCount}つ選べ」がありません`, id);
          }
        } else if (q.type === 'truefalse') {
          if (typeof q.answer !== 'boolean') err('○×の answer は true（○）か false（×）にしてください', id);
          if (q.choices !== undefined) err('○×に choices は不要です', id);
        } else if (q.type === 'flashcard') {
          if (!isStr(q.answerText)) err('一問一答の answerText（答え）がありません', id);
        }

        for (const [k, v] of [['question', q.question], ['explanation', q.explanation], ['answerText', q.answerText],
          ...(Array.isArray(q.choices) ? q.choices.map((c, j) => [`choices[${j}]`, c]) : [])]) {
          if (unbalancedMath(v)) err(`${k} の数式の $ が閉じていません`, id);
        }
        if (!q.retired) counts[q.type] += 1;
      });
    }

    for (const k of kpIds) if (!covered.has(k)) err(`要点 ${k} を扱う問題がありません（網羅できていません）`);
    materials.push({ file, where, data: d, counts });
  }

  return { errors, warnings, materials };
}
