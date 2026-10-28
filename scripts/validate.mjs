// 問題バンク（quiz-bank/）に不備がないか検査する
//   node scripts/validate.mjs          … エラー・注意・資料ごとの問題数を表示
//   node scripts/validate.mjs --quiet  … エラーと注意だけ表示
// 終了コード: 0=合格, 1=エラーあり
import { validateBank, TYPES, TYPE_LABELS } from './lib/validate-core.mjs';

const quiet = process.argv.includes('--quiet');
const { errors, warnings, materials } = validateBank();

if (!quiet) {
  for (const m of materials) {
    const total = TYPES.reduce((s, t) => s + m.counts[t], 0);
    const breakdown = TYPES.map((t) => `${TYPE_LABELS[t]}${m.counts[t]}`).join(' ');
    console.log(`${m.where}: ${total}問（${breakdown}）要点${m.data.keyPoints?.length ?? 0}`);
  }
}
for (const w of warnings) console.log(`注意: ${w}`);
for (const e of errors) console.log(`エラー: ${e}`);
console.log(`資料 ${materials.length}件 / エラー ${errors.length}件 / 注意 ${warnings.length}件`);
process.exit(errors.length ? 1 : 0);
