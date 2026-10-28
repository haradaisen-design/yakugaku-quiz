// アプリの公開フォルダ（docs/）の変更だけを記録して GitHub に送る
//   node scripts/publish.mjs "記録のメッセージ"
//   node scripts/publish.mjs --dry-run … 記録はせず、合鍵で GitHub に書き込めるかだけ確かめる（何も送らない）
// 環境変数 QUIZ_NO_PUSH=1 のときは記録だけして送らない（テスト用）
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, GITHUB_TOKEN_FILE, today } from './lib/common.mjs';

const fail = (msg) => { console.error(`エラー: ${msg}`); process.exit(1); };
const git = (args, options = {}) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', ...options });
const out = (args) => git(args).stdout.trim();

// 安全確認 1: このフォルダ専用の git であること（ホームフォルダの git などを触らない）
const top = out(['rev-parse', '--show-toplevel']);
if (!top || path.resolve(top).toLowerCase() !== path.resolve(ROOT).toLowerCase()) {
  fail(`このフォルダ専用の git ではありません（${top || '未作成'}）。安全のため中止します。`);
}
// 安全確認 2: 記録に使う名前とメールがこのフォルダ用に設定されていること（PC 全体の設定を使わない）
if (!out(['config', '--local', 'user.name']) || !out(['config', '--local', 'user.email'])) {
  fail('このフォルダ用の名前とメールが未設定です（初回設定で行います）。');
}

const dryRun = process.argv.includes('--dry-run');

if (!dryRun) {
  git(['add', '--', 'docs']);
  // 安全確認 3: docs/ 以外が記録対象に入っていないこと
  const staged = out(['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean);
  const outside = staged.filter((f) => !f.startsWith('docs/'));
  if (outside.length) fail(`docs/ 以外のファイルが記録対象に入っています: ${outside.join(', ')}`);

  if (staged.length) {
    const message = process.argv[2] || `クイズ更新 ${today()}`;
    const r = git(['commit', '-q', '-m', message, '-m', 'Co-Authored-By: Claude <noreply@anthropic.com>']);
    if (r.status !== 0) fail(`記録できませんでした: ${r.stderr || r.stdout}`);
    console.log(`記録しました: ${message}（${staged.length}ファイル）`);
  } else {
    console.log('新しく記録する変更はありません。');
  }

  if (process.env.QUIZ_NO_PUSH === '1') { console.log('テストのため GitHub には送りません。'); process.exit(0); }
}
if (git(['remote', 'get-url', 'origin']).status !== 0) fail('GitHub の送り先がまだ設定されていません（初回設定で行います）。');
if (!fs.existsSync(GITHUB_TOKEN_FILE)) fail('GitHub の合鍵が未設定です。「GitHubの合鍵を設定.cmd」をダブルクリックして設定してください。');

// PC 全体のログイン情報は使わず、このフォルダの合鍵だけで送る
const helper = `!node "${path.join(ROOT, 'scripts', 'git-credential.mjs').replace(/\\/g, '/')}"`;
const push = git(['-c', 'credential.helper=', '-c', `credential.helper=${helper}`, 'push', '-q', ...(dryRun ? ['--dry-run'] : []), 'origin', 'HEAD:main'], {
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
});
if (push.status !== 0) {
  const msg = push.stderr || push.stdout;
  if (/403|401|Authentication|Permission/i.test(msg)) fail(`GitHub に送れませんでした（合鍵が無効か期限切れの可能性）。\n${msg}`);
  fail(`GitHub に送れませんでした。\n${msg}`);
}
console.log(dryRun ? '確認できました: 合鍵で GitHub に書き込めます（何も送っていません）。' : 'GitHub に送りました。1〜2分でスマホのアプリに反映されます。');
