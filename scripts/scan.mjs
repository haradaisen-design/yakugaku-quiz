// 授業資料フォルダを調べて、まだ問題にしていない資料を一覧にする
//   node scripts/scan.mjs                 … 日本語で一覧表示
//   node scripts/scan.mjs --json          … 処理用の JSON を出力（/quiz-update が使う）
//   node scripts/scan.mjs --check         … 終了コードだけ返す（0=作業なし, 10=作業あり, 1=エラー）
//   node scripts/scan.mjs --apply-renames … 名前が変わっただけの資料は問題データの出典を自動で直す
import { scanMaterials } from './lib/materials.mjs';
import { relFromRoot } from './lib/common.mjs';

const args = new Set(process.argv.slice(2));

try {
  const r = await scanMaterials({ applyRenames: args.has('--apply-renames') });
  const work = r.new.length + r.changed.length + (args.has('--apply-renames') ? 0 : r.renamed.length);

  if (args.has('--check')) {
    console.log(work ? `新しい・変更された資料: ${work}件` : '新しい資料はありません');
    process.exit(work ? 10 : 0);
  }

  if (args.has('--json')) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  }

  const section = (title, items, fmt) => {
    console.log(`${title}: ${items.length}件`);
    for (const it of items) console.log(`  - ${fmt(it)}`);
  };
  console.log(`授業資料フォルダ: ${r.materialsDir}`);
  section('新しい資料', r.new, (m) => m.sourceFile);
  section('内容が変わった資料', r.changed, (m) => m.sourceFile);
  section(args.has('--apply-renames') ? '名前の変更を反映した資料' : '名前が変わった資料', r.renamed, (m) => `${m.from} → ${m.to}`);
  section('元の資料が見つからない問題データ（問題は残しています）', r.missing, (m) => m.sourceFile);
  section('同じ内容の資料が既にあるため飛ばしたもの', r.duplicates, (m) => `${m.sourceFile}（${m.sameAs} と同じ）`);
  section('置き場所が違うもの（学期/科目/資料 の形にしてください）', r.misplaced, (p) => p);
  section('対応していない形式（PDF・PowerPoint・Word・画像・テキストに対応）', r.unsupported, (p) => p);
  if (r.brokenBankFiles.length) section('読めない問題データ', r.brokenBankFiles, relFromRoot);
  console.log(`問題作成済みで変更なし: ${r.unchanged.length}件`);
} catch (e) {
  console.error(`エラー: ${e.message}`);
  process.exit(1);
}
