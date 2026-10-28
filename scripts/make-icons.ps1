# アプリのアイコン（PNG）を docs\icons\ に作る。デザインを変えたいときだけ実行すればよい。
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$Root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $Root 'docs\icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-RoundedPath([float]$Size, [float]$Radius) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $Radius * 2
  $p.AddArc(0, 0, $d, $d, 180, 90)
  $p.AddArc($Size - $d, 0, $d, $d, 270, 90)
  $p.AddArc($Size - $d, $Size - $d, $d, $d, 0, 90)
  $p.AddArc(0, $Size - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

# $Rounded: 角を丸める（通常のアイコン）／$GlyphScale: 文字の大きさ（マスク用は小さめ）
function New-Icon([int]$Size, [string]$Name, [double]$GlyphScale, [bool]$Rounded) {
  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::Transparent)
  $rect = New-Object System.Drawing.Rectangle 0, 0, $Size, $Size
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(20, 184, 166)), ([System.Drawing.Color]::FromArgb(15, 118, 110)), 45.0
  if ($Rounded) { $g.FillPath($brush, (New-RoundedPath $Size ($Size * 0.22))) } else { $g.FillRectangle($brush, $rect) }

  $font = New-Object System.Drawing.Font 'Yu Gothic UI', ([float]($Size * $GlyphScale)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $area = New-Object System.Drawing.RectangleF 0, ([float]($Size * 0.03)), $Size, $Size
  $g.DrawString([string][char]0x85AC, $font, [System.Drawing.Brushes]::White, $area, $format)  # 「薬」

  $bmp.Save((Join-Path $outDir $Name), [System.Drawing.Imaging.ImageFormat]::Png)
  $font.Dispose(); $brush.Dispose(); $g.Dispose(); $bmp.Dispose()
}

New-Icon 180 'apple-touch-icon.png' 0.56 $false
New-Icon 192 'icon-192.png' 0.56 $true
New-Icon 512 'icon-512.png' 0.56 $true
New-Icon 512 'icon-maskable-512.png' 0.40 $false
New-Icon 32 'favicon-32.png' 0.72 $true
Write-Output "アイコンを作成しました: $outDir"
