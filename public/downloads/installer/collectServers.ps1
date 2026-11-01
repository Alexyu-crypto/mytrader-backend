# Finds MetaTrader server files on this PC and sends new ones to the Broker Files library.
# Loaded by control.ps1 on company PCs; runs on its own when the downloaded collector sets $BfcCollectKey.

function Get-BfcBrokerHint($path) {
  $name = Split-Path "$path".TrimEnd('\') -Leaf
  $words = (($name -replace '(?i)metatrader|terminal|mt[45]|x64|\d+', ' ') -replace '[^A-Za-z]+', ' ').Trim()
  return ($words -replace '\s+', '-')
}

function Get-BfcMt5Server($dir) {
  $ini = Join-Path $dir 'config\common.ini'
  if (-not (Test-Path -LiteralPath $ini)) { return '' }
  try { $text = Get-Content -LiteralPath $ini -Raw -ErrorAction Stop } catch { return '' }
  if ($text -match '(?m)^Server=(.+?)\s*$') { return $Matches[1].Trim() }
  return ''
}

function Get-BfcPlatform($dir) {
  if (Test-Path -LiteralPath (Join-Path $dir 'terminal64.exe')) { return 'MT5' }
  if (Test-Path -LiteralPath (Join-Path $dir 'terminal.exe')) { return 'MT4' }
  if (Test-Path -LiteralPath (Join-Path $dir 'MQL5')) { return 'MT5' }
  if (Test-Path -LiteralPath (Join-Path $dir 'MQL4')) { return 'MT4' }
  return ''
}

# Folders holding terminal.exe / terminal64.exe on every local hard drive, a few levels deep.
# System and per-user folders are skipped: they are huge and user data folders are covered separately.
function Find-BfcInstallDirs($MaxDepth = 5) {
  $skip = @('Windows', '$Recycle.Bin', 'System Volume Information', 'Recovery', 'AppData', 'WinSxS', 'node_modules', '.git', 'Config.Msi', 'MSOCache')
  $hits = New-Object System.Collections.Generic.List[string]
  $queue = New-Object System.Collections.Generic.Queue[object]
  foreach ($d in @([IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq 'Fixed' -and $_.IsReady })) { $queue.Enqueue([pscustomobject]@{ path = $d.RootDirectory.FullName; depth = 0 }) }
  while ($queue.Count -gt 0) {
    $next = $queue.Dequeue()
    $path = [string]$next.path
    $depth = [int]$next.depth
    if ([IO.File]::Exists((Join-Path $path 'terminal64.exe')) -or [IO.File]::Exists((Join-Path $path 'terminal.exe'))) { $hits.Add($path) }
    if ($depth -ge $MaxDepth) { continue }
    try { $subs = [IO.Directory]::GetDirectories($path) } catch { continue }
    foreach ($s in $subs) {
      if ($skip -contains [IO.Path]::GetFileName($s)) { continue }
      try { if (([IO.File]::GetAttributes($s) -band [IO.FileAttributes]::ReparsePoint)) { continue } } catch { continue }
      $queue.Enqueue([pscustomobject]@{ path = $s; depth = $depth + 1 })
    }
  }
  return $hits
}

# Every MT on the PC: data folders of all Windows users, installed programs and any MT running from elsewhere.
function Get-BfcTerminals($skipRoot) {
  $found = @()
  foreach ($u in @(Get-ChildItem -LiteralPath (Join-Path $env:SystemDrive 'Users') -Directory -ErrorAction SilentlyContinue)) {
    $mq = Join-Path $u.FullName 'AppData\Roaming\MetaQuotes\Terminal'
    foreach ($d in @(Get-ChildItem -LiteralPath $mq -Directory -ErrorAction SilentlyContinue)) {
      if ($d.Name -notmatch '^[0-9A-Fa-f]{32}$') { continue }
      $platform = Get-BfcPlatform $d.FullName
      if (-not $platform) { continue }
      $hint = ''
      $origin = Join-Path $d.FullName 'origin.txt'
      if (Test-Path -LiteralPath $origin) { try { $hint = Get-BfcBrokerHint ((Get-Content -LiteralPath $origin -Raw).Trim()) } catch {} }
      $found += [pscustomobject]@{ dir = $d.FullName; platform = $platform; hint = $hint }
    }
  }
  $installs = @(Find-BfcInstallDirs)
  foreach ($p in @(Get-Process -Name terminal, terminal64 -ErrorAction SilentlyContinue)) {
    try { if ($p.Path) { $installs += (Split-Path $p.Path) } } catch {}
  }
  foreach ($dir in $installs) {
    $platform = Get-BfcPlatform $dir
    if ($platform -and (Test-Path -LiteralPath (Join-Path $dir 'config'))) { $found += [pscustomobject]@{ dir = $dir; platform = $platform; hint = Get-BfcBrokerHint $dir } }
  }
  if ($skipRoot) {
    $prefix = $skipRoot.TrimEnd('\') + '\'
    $found = @($found | Where-Object { -not $_.dir.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) })
  }
  return @($found | Sort-Object -Property dir -Unique)
}

function Get-BfcFiles($t) {
  $config = Join-Path $t.dir 'config'
  if ($t.platform -eq 'MT5') {
    $f = Get-Item -LiteralPath (Join-Path $config 'servers.dat') -ErrorAction SilentlyContinue
    if ($f) { [pscustomobject]@{ file = $f; platform = 'MT5'; server = Get-BfcMt5Server $t.dir; hint = $t.hint } }
    return
  }
  foreach ($f in @(Get-ChildItem -LiteralPath $config -Filter '*.srv' -File -ErrorAction SilentlyContinue)) {
    [pscustomobject]@{ file = $f; platform = 'MT4'; server = ''; hint = $t.hint }
  }
  # Newer MT4 keeps brokers found at login in one shared servers.ini instead of .srv files.
  $shared = Get-Item -LiteralPath (Join-Path $config 'servers.ini') -ErrorAction SilentlyContinue
  if ($shared) { [pscustomobject]@{ file = $shared; platform = 'MT4'; server = ''; hint = $t.hint } }
}

# $Send posts one file to the website. Files already sent (by fingerprint) are skipped, so each file travels once.
function Invoke-ServerHarvest($Send, $StateFile, $SkipRoot, $Limit = 60, [switch]$Show) {
  $sent = @{}
  if (Test-Path -LiteralPath $StateFile) {
    try { foreach ($h in @([IO.File]::ReadAllText($StateFile) | ConvertFrom-Json)) { $sent["$h"] = $true } } catch {}
  }
  $r = @{ terminals = 0; files = 0; added = 0; exists = 0; skipped = 0; failed = 0; denied = $false; error = '' }
  $sha = [Security.Cryptography.SHA256]::Create()
  $terminals = @(Get-BfcTerminals $SkipRoot)
  $r.terminals = $terminals.Count
  foreach ($item in @($terminals | ForEach-Object { Get-BfcFiles $_ })) {
    if (-not $item -or $r.denied -or $Limit -le 0) { continue }
    $r.files++
    if ($item.file.Length -lt 64 -or $item.file.Length -gt 4MB) { continue }
    try { $bytes = [IO.File]::ReadAllBytes($item.file.FullName) } catch { continue }
    $hash = -join ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') })
    if ($sent.ContainsKey($hash)) { $r.exists++; continue }
    $Limit--
    try {
      $res = & $Send @{
        action = 'harvest'; platform = $item.platform; file_name = $item.file.Name; server = $item.server
        broker_hint = $item.hint; machine_name = $env:COMPUTERNAME; file = [Convert]::ToBase64String($bytes)
        modified_at = $item.file.LastWriteTimeUtc.ToString('o')
      }
      $sent[$hash] = $true
      $status = "$($res.status)"
      if ($status -eq 'added' -or $status -eq 'replaced') { $r.added++ } elseif ($status -eq 'skipped') { $r.skipped++ } else { $r.exists++ }
      if ($Show) { Write-Host ("  {0,-8} {1} {2}  ({3})" -f $status, $item.platform, $item.file.Name, $item.file.DirectoryName) }
    } catch {
      $r.failed++
      $r.error = "$_"
      if ($r.error -match 'not allowed') { $r.denied = $true }
    }
  }
  try {
    New-Item -ItemType Directory -Force -Path (Split-Path $StateFile) | Out-Null
    [IO.File]::WriteAllText($StateFile, (ConvertTo-Json -InputObject @($sent.Keys) -Compress))
  } catch {}
  return $r
}

if ($BfcCollectKey) {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $ProgressPreference = 'SilentlyContinue'
  Write-Host ''
  Write-Host '  Broker server file collector' -ForegroundColor Cyan
  Write-Host '  Looking for MT4 / MT5 server files on this PC...'
  Write-Host ''
  $send = {
    param($body)
    $body.collect_key = $BfcCollectKey
    try {
      return Invoke-RestMethod -Uri $BfcFunctionUrl -Method Post -Body ([Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Compress))) `
        -ContentType 'application/json; charset=utf-8' -Headers @{ apikey = $BfcAnonKey; Authorization = "Bearer $BfcAnonKey" } -TimeoutSec 90
    } catch {
      $msg = $_.Exception.Message
      if ($_.ErrorDetails -and $_.ErrorDetails.Message) { try { $msg = ($_.ErrorDetails.Message | ConvertFrom-Json).error } catch {} }
      throw $msg
    }
  }
  $r = Invoke-ServerHarvest $send (Join-Path $env:LOCALAPPDATA 'BrokerFileCollector\sent2.json') $null 500 -Show
  Write-Host ''
  Write-Host "  MT found: $($r.terminals)   Server files: $($r.files)"
  Write-Host "  New / updated in library: $($r.added)   Already there: $($r.exists)   Could not name: $($r.skipped)" -ForegroundColor Green
  if ($r.denied) { Write-Host '  This collector has expired. Download a new one from Broker Files.' -ForegroundColor Yellow }
  elseif ($r.failed -gt 0) { Write-Host "  $($r.failed) file(s) could not be sent: $($r.error). Run the collector again later." -ForegroundColor Yellow }
  Write-Host ''
  Read-Host '  Press Enter to close'
}
