# PowerPoint / Word の資料を PDF に変換する（scripts/convert.mjs から呼ばれる）
# 元の資料は読み取り専用で開き、変更しない。Word は「最近使ったファイル」に追加しない設定で開く。
# すでに開いている PowerPoint / Word があれば、それは閉じない。
# -PidFile: この処理が新しく起動した PowerPoint / Word のプロセス番号を書く（応答しないときに prepare.mjs がそれだけを終了するため）
param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [string]$PidFile = ''
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)

function Release($o) { if ($null -ne $o) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($o) } }

function New-OfficeApp([string]$ProgId, [string]$ProcessName) {
  $before = @(Get-Process $ProcessName -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
  $app = New-Object -ComObject $ProgId
  $started = @(Get-Process $ProcessName -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.Id } | ForEach-Object { $_.Id })
  if ($PidFile -and $started.Count) { Set-Content -LiteralPath $PidFile -Value ($started -join ',') }
  return $app
}

try {
  $ext = [IO.Path]::GetExtension($InputPath).ToLower()
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath) | Out-Null
  if (Test-Path -LiteralPath $OutputPath) { Remove-Item -LiteralPath $OutputPath }

  if ($ext -eq '.pptx' -or $ext -eq '.ppt') {
    $wasRunning = [bool](Get-Process POWERPNT -ErrorAction SilentlyContinue)
    $app = New-OfficeApp 'PowerPoint.Application' 'POWERPNT'
    $pres = $null
    try {
      if (-not $wasRunning) { $app.DisplayAlerts = 1 }  # 1 = 確認ダイアログを出さない
      # 引数: ファイル, 読み取り専用(-1=はい), 無題として開く(0=いいえ), ウィンドウ表示(0=なし)
      $pres = $app.Presentations.Open($InputPath, -1, 0, 0)
      $pres.SaveAs($OutputPath, 32)  # 32 = PDF
    } finally {
      if ($null -ne $pres) { $pres.Close(); Release $pres }
      if (-not $wasRunning -and $app.Presentations.Count -eq 0) { $app.Quit() }
      Release $app
    }
  } elseif ($ext -eq '.docx' -or $ext -eq '.doc') {
    $word = New-OfficeApp 'Word.Application' 'WINWORD'
    $doc = $null
    try {
      $ownInstance = ($word.Documents.Count -eq 0)
      if ($ownInstance) { $word.DisplayAlerts = 0 }
      # 引数: ファイル, 変換の確認(しない), 読み取り専用(はい), 最近使ったファイルに追加(しない)
      $doc = $word.Documents.Open($InputPath, $false, $true, $false)
      $doc.ExportAsFixedFormat($OutputPath, 17)  # 17 = PDF
    } finally {
      if ($null -ne $doc) { $doc.Close(0); Release $doc }  # 0 = 保存しない
      if ($word.Documents.Count -eq 0) { $word.Quit(0) }
      Release $word
    }
  } else {
    throw "対応していない形式です: $ext"
  }

  if (-not (Test-Path -LiteralPath $OutputPath)) { throw 'PDF が作成されませんでした' }
  Write-Output "変換しました: $OutputPath"
} catch {
  Write-Output "変換に失敗しました: $($_.Exception.Message)"
  exit 1
}
