# 毎日の自動更新を Windows のタスクスケジューラに登録／解除する
# 「自動更新を登録.cmd」「自動更新を解除.cmd」をユーザーがダブルクリックして実行する（Claude は実行しない）
param([switch]$Unregister)
$ErrorActionPreference = 'Stop'
$TaskName = 'YakugakuQuizDailyUpdate'
$Root = Split-Path -Parent $PSScriptRoot
$script = Join-Path $Root 'scripts\daily-update.ps1'

Write-Host ''
if ($Unregister) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host '自動更新を解除しました。'
  } else {
    Write-Host '自動更新は登録されていません。'
  }
  exit 0
}

$user = "$env:USERDOMAIN\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`"" -WorkingDirectory $Root
$daily = New-ScheduledTaskTrigger -Daily -At '21:00'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 3)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$description = '薬学クイズ: 新しい授業資料があればクイズを作り、スマホアプリに反映する'

try {
  $logon = New-ScheduledTaskTrigger -AtLogOn -User $user
  $logon.Delay = 'PT5M'
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($daily, $logon) -Settings $settings -Principal $principal -Description $description -Force | Out-Null
  Write-Host '登録しました。毎日21:00 と、PCにログインした5分後に新しい資料を確認します。'
} catch {
  # ログイン時の実行が登録できない環境では、毎日21:00 だけにする
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $daily -Settings $settings -Principal $principal -Description $description -Force | Out-Null
  Write-Host '登録しました。毎日21:00 に新しい資料を確認します。'
}
Write-Host 'PCの電源が切れていた日は、次にPCを使い始めたときに実行されます。'
Write-Host 'やめたいときは「自動更新を解除.cmd」をダブルクリックしてください。'
