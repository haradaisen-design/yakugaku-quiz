# 毎日の自動更新（タスクスケジューラ、または「今すぐクイズを更新.cmd」から実行）
#   1. 新しい資料があるか確認（なければすぐ終了。Claude の利用枠は使わない）
#   2. あれば Claude Code に /quiz-update を実行させ、問題を作って GitHub に送る
#   ログは logs\ に保存する。-NoPush を付けると GitHub には送らない（テスト用）。
param([switch]$NoPush)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
$work = Join-Path $Root 'work'
$logs = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force -Path $work, $logs | Out-Null
$log = Join-Path $logs ('update-{0}.log' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

function Log([string]$Message) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $Message
  Add-Content -LiteralPath $log -Value $line -Encoding UTF8
  Write-Host $line
}

# Windows の通知を表示する（失敗しても処理は続ける）
function Notify([string]$Message) {
  try {
    [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
    [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $text = [Security.SecurityElement]::Escape($Message)
    $xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text>薬学クイズ</text><text>$text</text></binding></visual></toast>")
    $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show([Windows.UI.Notifications.ToastNotification]::new($xml))
  } catch { }
}

# Claude Code 本体を探す（PATH → VS Code 拡張機能の最新版）
function Find-Claude {
  $cmd = Get-Command claude -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $extDir = Join-Path $env:USERPROFILE '.vscode\extensions'
  $found = Get-ChildItem -LiteralPath $extDir -Directory -Filter 'anthropic.claude-code-*' -ErrorAction SilentlyContinue | ForEach-Object {
    $exe = Join-Path $_.FullName 'resources\native-binary\claude.exe'
    $ver = ($_.Name -replace '^anthropic\.claude-code-', '') -replace '-.*$', ''
    if ((Test-Path -LiteralPath $exe) -and ($ver -as [version])) { [pscustomobject]@{ Exe = $exe; Version = [version]$ver } }
  } | Sort-Object Version -Descending
  if ($found) { return @($found)[0].Exe }
  return $null
}

function Invoke-Node([string[]]$NodeArgs) {
  # PowerShell 5.1 ではエラー出力を拾うと止まってしまうため、この中だけ続行にする
  $ErrorActionPreference = 'Continue'
  $output = & node @NodeArgs 2>&1 | ForEach-Object { "$_" }
  foreach ($line in $output) { Log $line }
  return $LASTEXITCODE
}

$lock = Join-Path $work 'update.lock'
if ((Test-Path -LiteralPath $lock) -and ((Get-Date) - (Get-Item -LiteralPath $lock).LastWriteTime).TotalHours -lt 4) {
  Log '別の更新が実行中のため終了します。'
  exit 0
}
Set-Content -LiteralPath $lock -Value $PID

try {
  if ($NoPush) { $env:QUIZ_NO_PUSH = '1' }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js が見つかりません' }

  Log '新しい資料を確認します。'
  $code = Invoke-Node @('scripts/scan.mjs', '--check', '--apply-renames')
  if ($code -eq 0) {
    # 資料の名前変更や手作業の修正があれば、公開だけ行う（Claude は使わない）
    if ((Invoke-Node @('scripts/build.mjs', '--quiet')) -eq 0) { [void](Invoke-Node @('scripts/publish.mjs')) }
    Log '終了します。'
    exit 0
  }
  if ($code -ne 10) { throw '資料の確認でエラーが出ました' }

  $claude = Find-Claude
  if (-not $claude) { throw 'Claude Code が見つかりません（VS Code の Claude Code 拡張機能が必要です）' }
  Log "Claude Code で問題を作ります: $claude"

  # 自動実行で許可する操作（これ以外は自動的に拒否される）
  $allowed = @(
    'Read', 'Glob', 'Grep', 'Agent', 'Skill', 'TodoWrite',
    'Edit(./quiz-bank/**)', 'Edit(./work/**)',
    'Bash(node scripts/*)', 'PowerShell(node scripts/*)'
  )
  $prompt = '/quiz-update 自動実行です。ユーザーに質問はできません。判断に迷う点は最後の報告にまとめてください。'
  $ErrorActionPreference = 'Continue'
  & $claude -p $prompt --permission-mode dontAsk --allowedTools @allowed --no-session-persistence --output-format text 2>&1 |
    ForEach-Object { Add-Content -LiteralPath $log -Value "$_" -Encoding UTF8 }
  $claudeCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  Log "Claude Code の終了コード: $claudeCode"

  # 送り忘れがあっても確実に公開する（変更がなければ何もしない）
  if ((Invoke-Node @('scripts/build.mjs', '--quiet')) -eq 0) { [void](Invoke-Node @('scripts/publish.mjs')) }

  $result = Select-String -LiteralPath $log -Pattern '^RESULT:\s*(.+)$' -Encoding UTF8 | Select-Object -Last 1
  if ($claudeCode -eq 0 -and $result) { Notify $result.Matches[0].Groups[1].Value }
  elseif ($claudeCode -eq 0) { Notify 'クイズを更新しました。' }
  else { Notify "自動更新でエラーが出ました。ログを確認してください: $log" }
  Log '終了します。'
} catch {
  Log "エラー: $($_.Exception.Message)"
  Notify "自動更新でエラーが出ました: $($_.Exception.Message)"
  exit 1
} finally {
  Remove-Item -LiteralPath $lock -ErrorAction SilentlyContinue
}
