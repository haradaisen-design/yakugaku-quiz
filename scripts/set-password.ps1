# スマホアプリを開くときのパスワードを設定する（「パスワードを設定.cmd」から実行）
# 入力は画面に表示されず、Claude にも見えない。作業フォルダ内の .secrets\quiz-password.txt に保存する。
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $Root '.secrets'
$file = Join-Path $dir 'quiz-password.txt'

function Read-Secret([string]$Prompt) {
  $secure = Read-Host -AsSecureString $Prompt
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

Write-Host ''
Write-Host '=== 薬学クイズ: パスワードの設定 ==='
Write-Host 'スマホでアプリを初めて開くときに入力するパスワードを決めます。'
Write-Host '  - 8文字以上（英字と数字を混ぜるのがおすすめ）'
Write-Host '  - 入力した文字は * で表示されます（文字そのものは見えません）'
if (Test-Path -LiteralPath $file) {
  Write-Host ''
  Write-Host '※ すでに設定されています。変更すると、次の更新のあとスマホで新しいパスワードの入力が必要になります。'
}
Write-Host ''

while ($true) {
  $first = Read-Secret 'パスワード'
  if ($first.Length -lt 8) { Write-Host '8文字以上にしてください。'; continue }
  $second = Read-Secret '確認のため、もう一度入力'
  if ($first -cne $second) { Write-Host '2回の入力が一致しません。もう一度どうぞ。'; continue }
  break
}

New-Item -ItemType Directory -Force -Path $dir | Out-Null
[IO.File]::WriteAllText($file, $first, (New-Object Text.UTF8Encoding($false)))
Write-Host ''
Write-Host '設定しました。忘れないようにメモしておいてください。'
Write-Host '（このPCの作業フォルダ内 .secrets フォルダにも保存されています）'
