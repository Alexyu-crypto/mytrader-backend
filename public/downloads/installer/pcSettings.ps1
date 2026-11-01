$HighPerformanceScheme = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'
$WinlogonKey = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'

function Get-PcBackupPath($root) { return (Join-Path $root '_pc_backup.json') }

function Read-PcBackup($root) {
  $path = Get-PcBackupPath $root
  $backup = @{ power_scheme = $null; hibernate = $null; registry = New-Object System.Collections.ArrayList }
  if (Test-Path -LiteralPath $path) {
    $saved = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8) | ConvertFrom-Json
    $backup.power_scheme = $saved.power_scheme
    $backup.hibernate = $saved.hibernate
    foreach ($r in @($saved.registry)) { if ($r) { [void]$backup.registry.Add(@{ path = $r.path; name = $r.name; existed = $r.existed; value = $r.value; kind = $r.kind }) } }
  }
  return $backup
}

function Save-PcBackup($root, $backup) {
  $json = [ordered]@{ power_scheme = $backup.power_scheme; hibernate = $backup.hibernate; registry = @($backup.registry) } | ConvertTo-Json -Depth 5
  [IO.File]::WriteAllText((Get-PcBackupPath $root), $json, (New-Object Text.UTF8Encoding $true))
}

function Set-RegTracked($backup, $path, $name, $value, $kind = 'DWord') {
  $known = $backup.registry | Where-Object { $_.path -eq $path -and $_.name -eq $name }
  if (-not $known) {
    $current = $null
    $existed = $false
    try { $current = (Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction Stop).$name; $existed = $true } catch {}
    [void]$backup.registry.Add(@{ path = $path; name = $name; existed = $existed; value = $current; kind = $kind })
  }
  if (-not (Test-Path -LiteralPath $path)) { New-Item -Path $path -Force | Out-Null }
  New-ItemProperty -LiteralPath $path -Name $name -Value $value -PropertyType $kind -Force | Out-Null
}

function Get-ActiveSchemeGuid {
  $line = (powercfg /getactivescheme) -join ' '
  if ($line -match '([0-9a-fA-F-]{36})') { return $Matches[1] }
  return $null
}

function Set-PowerForTrading($backup) {
  if (-not $backup.power_scheme) { $backup.power_scheme = Get-ActiveSchemeGuid }
  if ($null -eq $backup.hibernate) { $backup.hibernate = Test-Path -LiteralPath (Join-Path $env:SystemDrive 'hiberfil.sys') }
  powercfg /setactive $HighPerformanceScheme 2>$null | Out-Null
  if ((Get-ActiveSchemeGuid) -ne $HighPerformanceScheme) {
    $dup = (powercfg /duplicatescheme $HighPerformanceScheme) -join ' '
    if ($dup -match '([0-9a-fA-F-]{36})') { powercfg /setactive $Matches[1] | Out-Null }
  }
  foreach ($setting in 'standby-timeout', 'hibernate-timeout', 'disk-timeout', 'monitor-timeout') {
    powercfg /change "$setting-ac" 0 | Out-Null
    powercfg /change "$setting-dc" 0 | Out-Null
  }
  powercfg /hibernate off 2>$null | Out-Null
}

function Set-UpdatesForTrading($backup) {
  $wu = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate'
  Set-RegTracked $backup "$wu\AU" 'NoAutoRebootWithLoggedOnUsers' 1
  Set-RegTracked $backup "$wu\AU" 'AUOptions' 2
  Set-RegTracked $backup "$wu\AU" 'NoAutoUpdate' 0
  Set-RegTracked $backup $wu 'SetAutoRestartNotificationDisable' 1
  Set-RegTracked $backup $wu 'ExcludeWUDriversInQualityUpdate' 1
  Set-RegTracked $backup 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization' 'DODownloadMode' 0
  Set-RegTracked $backup 'HKLM:\SOFTWARE\Policies\Microsoft\WindowsStore' 'AutoDownload' 2
}

function Test-AutoLogonOn {
  try { return ((Get-ItemProperty -LiteralPath $WinlogonKey -Name AutoAdminLogon -ErrorAction Stop).AutoAdminLogon -eq '1') } catch { return $false }
}

function Enable-AutoLogon($backup, $user, $domain, $password) {
  Set-RegTracked $backup 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\PasswordLess\Device' 'DevicePasswordLessBuildVersion' 0
  Set-RegTracked $backup $WinlogonKey 'DefaultUserName' $user 'String'
  Set-RegTracked $backup $WinlogonKey 'DefaultDomainName' $domain 'String'
  Set-RegTracked $backup $WinlogonKey 'DefaultPassword' $password 'String'
  Set-RegTracked $backup $WinlogonKey 'AutoAdminLogon' '1' 'String'
}

function Restore-PcSettings($root) {
  if (-not (Test-Path -LiteralPath (Get-PcBackupPath $root))) { return }
  $backup = Read-PcBackup $root
  for ($i = $backup.registry.Count - 1; $i -ge 0; $i--) {
    $r = $backup.registry[$i]
    try {
      if ($r.existed) { New-ItemProperty -LiteralPath $r.path -Name $r.name -Value $r.value -PropertyType $r.kind -Force | Out-Null }
      else { Remove-ItemProperty -LiteralPath $r.path -Name $r.name -Force -ErrorAction SilentlyContinue }
    } catch {}
  }
  if ($backup.power_scheme) { powercfg /setactive $backup.power_scheme 2>$null | Out-Null }
  if ($backup.hibernate) { powercfg /hibernate on 2>$null | Out-Null }
  Remove-Item -LiteralPath (Get-PcBackupPath $root) -Force -ErrorAction SilentlyContinue
}
