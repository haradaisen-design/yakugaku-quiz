# このプロジェクト（薬学部 授業資料クイズ）専用のルール

## 作業フォルダの外に関する補足

- ソフトのインストール、`git config --global`、他のリポジトリへの操作はしない。
- タスクスケジューラへの登録・解除は Claude が行わない（ユーザーが `自動更新を登録.cmd` / `自動更新を解除.cmd` をダブルクリックして行う）。
- PowerPoint・Word を裏で動かして資料を PDF に変換すること（`scripts/convert-office.ps1`）は、ユーザーの了承済み（PowerPoint の「最近使ったファイル」に資料名が載る可能性があることも了承済み）。元の資料は読み取り専用で開き、変更しない。
- 操作の前には、PC に詳しくない人にもわかる日本語で「何を・なぜ・何が変わるか」を説明する。

## 何をするプロジェクトか

`薬学部授業資料/<学期>/<科目>/` に置かれた授業資料から理解度確認クイズを作り、暗号化して GitHub Pages のスマホアプリ（`docs/`）に公開する。

| 場所（作業フォルダ内） | 中身 | GitHub に公開 |
|---|---|---|
| `薬学部授業資料/` | ユーザーが置く授業資料（入力） | しない |
| `quiz-bank/` | 平文の問題データ（正本） | しない |
| `.secrets/` | 暗号化パスワード。**Claude は読まない** | しない |
| `work/` `logs/` | 一時ファイル・自動実行のログ | しない |
| `docs/` | スマホアプリ本体と暗号化済みデータ | する |
| `scripts/` `.claude/` | 処理スクリプト・手順書 | する |

- `.gitignore` はホワイトリスト方式。公開してよいもの以外は追加しない。
- 授業資料や平文の問題を `docs/` などの公開場所に置かない。

## よく使う操作

- クイズの作成・更新: `/quiz-update`（手順は `.claude/skills/quiz-update/SKILL.md`）
- アプリからコピーした報告で問題を直す: `/quiz-fix`
- 新しい資料の確認: `node scripts/scan.mjs`
- 資料を読める形にそろえる（Office→PDF 変換、長い PDF の10ページ分割）: `node scripts/prepare.mjs`
- PDF は Read ツールで `pages` を指定せずに読む（この PC には pdftoppm がなく、ページ指定は使えない）
- 問題データの検査: `node scripts/validate.mjs`
- 暗号化して `docs/` に出力: `node scripts/build.mjs`
- PC で表示確認: `node scripts/serve.mjs`（http://localhost:8080/）
