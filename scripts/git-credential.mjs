// git が GitHub に送るときだけ呼ばれ、作業フォルダ内の合鍵（.secrets/github-token.txt）を渡す。
// PC 全体に保存されたログイン情報（Windows の資格情報）は使わないし、書き換えもしない。
import fs from 'node:fs';
import { GITHUB_TOKEN_FILE } from './lib/common.mjs';

let input = '';
for await (const chunk of process.stdin) input += chunk;

if (process.argv[2] === 'get' && /^host=github\.com$/m.test(input) && fs.existsSync(GITHUB_TOKEN_FILE)) {
  const token = fs.readFileSync(GITHUB_TOKEN_FILE, 'utf8').replace(/^﻿/, '').trim();
  process.stdout.write(`username=x-access-token\npassword=${token}\n`);
}
