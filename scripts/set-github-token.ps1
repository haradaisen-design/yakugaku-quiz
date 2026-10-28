# GitHub の合鍵（アクセストークン）を保存する（「GitHubの合鍵を設定.cmd」から実行）
# 入力は画面に表示されず、Claude にも見えない。作業フォルダ内の .secrets\github-token.txt に保存する。
# PC 全体のログイン情報（Windows の資格情報）には保存しない。
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $Root '.secrets'
$file = Join-Path $dir 'github-token.txt'

Write-Host ''
Write-Host '=== 薬学クイズ: GitHub の合鍵の設定 ==='
Write-Host 'GitHub の画面でコピーした合鍵（github_pat_ で始まる長い文字列）を貼り付けて Enter を押してください。'
Write-Host '  - 貼り付けは右クリック（または Ctrl+V）'
Write-Host '  - 貼り付けた文字は * で表示されます（文字そのものは見えません）'
Write-Host ''

while ($true) {
  $secure = Read-Host -AsSecureString '合鍵'
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  if ($token -match '^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$') { break }
  Write-Host '合鍵の形ではないようです。github_pat_ で始まる文字列全体をコピーして、もう一度貼り付けてください。'
}

New-Item -ItemType Directory -Force -Path $dir | Out-Null
[IO.File]::WriteAllText($file, $token, (New-Object Text.UTF8Encoding($false)))
Write-Host ''
Write-Host '保存しました。'
