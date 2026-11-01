param([ValidateSet('start', 'stop', 'arrange', 'nextpage', 'watchdog', 'uninstall')][string]$Action = 'start', [switch]$Quiet)

$runHidden = Join-Path $PSScriptRoot 'run-hidden.vbs'
function Write-RunHidden {
  [IO.File]::WriteAllText($runHidden, (@(
        'Set fso = CreateObject("Scripting.FileSystemObject")',
        'p = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "control.ps1")',
        'CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & p & """ -Action " & WScript.Arguments(0) & " -Quiet", 0, False'
      ) -join "`r`n"), [Text.Encoding]::ASCII)
}

# Windows Terminal ignores -WindowStyle Hidden; restart through the hidden launcher so no black window stays open.
if (-not $Quiet -and @('start', 'stop', 'arrange', 'nextpage') -contains $Action) {
  Write-RunHidden
  Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\wscript.exe') -ArgumentList @('//B', '//Nologo', "`"$runHidden`"", $Action)
  exit
}

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class CtWin {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hgt, bool repaint);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
}
"@
[CtWin]::SetProcessDPIAware() | Out-Null

$manifest = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'manifest.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
$title = "$($manifest.group_label) - Copy Terminals"
$pausedFlag = Join-Path $PSScriptRoot 'paused.flag'

function Show-Box($text, $buttons = 'OK', $icon = 'Information') {
  return [System.Windows.Forms.MessageBox]::Show($text, $title, $buttons, $icon)
}

function Invoke-Api($body) {
  $json = $body | ConvertTo-Json -Depth 6 -Compress
  $headers = @{ apikey = $manifest.anon_key; Authorization = "Bearer $($manifest.anon_key)" }
  try {
    $res = Invoke-WebRequest -Uri $manifest.function_url -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($json)) -ContentType 'application/json; charset=utf-8' -Headers $headers -UseBasicParsing -TimeoutSec 60
    return [Text.Encoding]::UTF8.GetString($res.RawContentStream.ToArray()) | ConvertFrom-Json
  } catch {
    $msg = $_.Exception.Message
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { try { $msg = ($_.ErrorDetails.Message | ConvertFrom-Json).error } catch {} }
    throw $msg
  }
}

function Get-TerminalProcess($t) {
  $name = [IO.Path]::GetFileNameWithoutExtension($t.exe)
  $prefix = $t.dir.TrimEnd('\') + '\'
  Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) }
}

function Get-Norm($text) { return ("$text" -replace '[^A-Za-z0-9]', '').ToLower() }

function Test-HasChart($t) {
  $chartDir = if ($t.platform -eq 'MT4') { 'profiles\default' } else { 'MQL5\Profiles\Charts\Default' }
  return [bool](Get-ChildItem -LiteralPath (Join-Path $t.dir $chartDir) -Filter '*.chr' -File -ErrorAction SilentlyContinue | Select-Object -First 1)
}

# MT5 forgets its saved login after a crash or forced close, so it gets the login again without [StartUp] (which would add a second chart and EA).
function Get-Mt5LoginArgs($t) {
  $setup = Join-Path $t.dir 'config\copybridge.ini'
  if (-not (Test-Path -LiteralPath $setup)) { return '/portable' }
  $keep = $true
  $lines = foreach ($line in [IO.File]::ReadAllLines($setup)) {
    if ($line.Trim() -match '^\[(.+)\]') { $keep = $Matches[1] -ne 'StartUp' }
    if ($keep) { $line }
  }
  $loginIni = Join-Path $t.dir 'config\copybridge-login.ini'
  [IO.File]::WriteAllText($loginIni, ($lines -join "`r`n"), [Text.Encoding]::Unicode)
  return "/portable /config:`"$loginIni`""
}

# Once an account has been online, MT reopens its own saved server and chart, so a broker picked by hand is kept.
function Get-LaunchArgs($t) {
  if ((Test-Path -LiteralPath (Join-Path $t.dir 'login.ok')) -and (Test-HasChart $t)) {
    if ($t.platform -eq 'MT5') { return Get-Mt5LoginArgs $t }
    return '/portable'
  }
  return $t.args
}

function Read-Health($t) {
  $h = @{ offline = 0; restarts = 0; server_saved = $false; flushed = $false; was_online = $false }
  try {
    $saved = [IO.File]::ReadAllText((Join-Path $t.dir 'health.json')) | ConvertFrom-Json
    $h.offline = [int]$saved.offline; $h.restarts = [int]$saved.restarts; $h.server_saved = [bool]$saved.server_saved; $h.flushed = [bool]$saved.flushed; $h.was_online = [bool]$saved.was_online
  } catch {}
  return $h
}

function Find-ServerFile($t) {
  $configDir = Join-Path $t.dir 'config'
  if ($t.platform -eq 'MT5') { return Get-Item -LiteralPath (Join-Path $configDir 'servers.dat') -ErrorAction SilentlyContinue }
  $files = @(Get-ChildItem -LiteralPath $configDir -Filter '*.srv' -File -ErrorAction SilentlyContinue)
  $want = Get-Norm $t.server
  $match = $files | Where-Object { (Get-Norm $_.BaseName) -eq $want } | Select-Object -First 1
  if ($match) { return $match }
  foreach ($f in $files) {
    $bytes = [IO.File]::ReadAllBytes($f.FullName)
    if ([Text.Encoding]::ASCII.GetString($bytes).Contains($t.server) -or [Text.Encoding]::Unicode.GetString($bytes).Contains($t.server)) { return $f }
  }
  $created = (Get-Item -LiteralPath $t.dir).CreationTime
  # Newer MT4 keeps a broker found at login in one shared servers.ini instead of a .srv file.
  $shared = Get-Item -LiteralPath (Join-Path $configDir 'servers.ini') -ErrorAction SilentlyContinue
  if ($shared -and $shared.LastWriteTime -gt $created) { return $shared }
  # A broker picked with Scan may be saved under another name, or update a file the base already had: take the newest one written here.
  return $files | Where-Object { $_.LastWriteTime -gt $created } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

# Returns $true only once the file is really stored on the website, so a miss is retried on the next check.
function Send-ServerFile($t, $h) {
  if (-not $t.learn -or -not $t.server) { return $true }
  $file = Find-ServerFile $t
  # MT may write a broker picked by hand to disk only when it closes, so close it once before giving up or sending a stale file.
  $stale = $file -and $t.platform -eq 'MT5' -and $file.LastWriteTime -lt [IO.File]::GetLastWriteTime((Join-Path $t.dir 'login.ok'))
  if ((-not $file -or $stale) -and -not $h.flushed) {
    Write-Host "  $($t.account_name): restarting $($t.platform) once so it writes its server file"
    Stop-Terminal $t
    $h.flushed = $true
    return $false
  }
  if (-not $file) { Write-Host "  $($t.account_name): server file not found yet"; return $false }
  try {
    $data = [Convert]::ToBase64String([IO.File]::ReadAllBytes($file.FullName))
    Invoke-Api @{ action = 'learn_server'; install_key = $manifest.install_key; account_name = $t.account_name; file = $data; file_name = $file.Name; replace = [bool]$t.replace } | Out-Null
    Write-Host "  $($t.account_name): server file $($file.Name) saved to the website"
    return $true
  } catch { Write-Host "  $($t.account_name): could not save server file ($_)"; return $false }
}

function Stop-Terminal($t) {
  foreach ($p in @(Get-TerminalProcess $t)) { try { $p.CloseMainWindow() | Out-Null } catch {} }
  Start-Sleep -Seconds 8
  foreach ($p in @(Get-TerminalProcess $t)) { try { Stop-Process -Id $p.Id -Force } catch {} }
}

# Restarts a terminal that stays cut off from its broker; after two failed restarts it falls back to the website's login details.
# Latest login problem from today's MT journal, or '' when the last login line was a success.
function Get-LoginError($t) {
  $log = Join-Path $t.dir ('logs\' + (Get-Date -Format 'yyyyMMdd') + '.log')
  if (-not (Test-Path -LiteralPath $log)) { return '' }
  try { $lines = @(Get-Content -LiteralPath $log -Tail 400 -ErrorAction Stop) } catch { return '' }
  for ($i = $lines.Count - 1; $i -ge 0; $i--) {
    $l = [string]$lines[$i]
    if ($l -match 'authorized on|login on .* through|login datacenter') { return '' }
    if ($l -match 'authorization .*failed|invalid account|account disabled|no connection|common error|old version|invalid server|trade server .*not found') {
      $msg = ($l -replace '^.*?\d{2}:\d{2}:\d{2}(\.\d+)?\s+', '').Trim()
      if ($msg.Length -gt 200) { $msg = $msg.Substring(0, 200) }
      return $msg
    }
  }
  return ''
}

# Why the EA is silent: newest EA problem line from today's terminal journal and EA log, or '' once the EA last started cleanly.
function Get-EaError($t) {
  $day = (Get-Date -Format 'yyyyMMdd') + '.log'
  $found = @()
  foreach ($log in @((Join-Path $t.dir "logs\$day"), (Join-Path $t.dir "$($Spec[$t.platform].Mql)\Logs\$day"))) {
    if (-not (Test-Path -LiteralPath $log)) { continue }
    try { $lines = @(Get-Content -LiteralPath $log -Tail 400 -ErrorAction Stop) } catch { continue }
    for ($i = $lines.Count - 1; $i -ge 0; $i--) {
      $l = [string]$lines[$i]
      if ($l -notmatch 'LiveBridge') { continue }
      if ($l -match 'loaded successfully|LiveBridge: v[\d.]+ initialized') { break }
      if ($l -match 'cannot load|failed|LiveBridge: (ERROR|WARNING - no website|HTTP |network error|err \d+|terminal is logged in to)') {
        $time = if ($l -match '(\d{2}:\d{2}:\d{2})') { $Matches[1] } else { '' }
        $msg = ($l -replace '^.*?\d{2}:\d{2}:\d{2}(\.\d+)?\s+', '').Trim()
        if ($msg.Length -gt 200) { $msg = $msg.Substring(0, 200) }
        $found += @{ time = $time; msg = $msg }
        break
      }
    }
  }
  if (-not $found) { return '' }
  return ($found | Sort-Object { $_.time } -Descending | Select-Object -First 1).msg
}

# Login number and server MT really connected with, from the newest "authorized on" line of the last two days' journals.
function Get-MtLogin($t) {
  foreach ($day in @((Get-Date), (Get-Date).AddDays(-1))) {
    $log = Join-Path $t.dir ('logs\' + $day.ToString('yyyyMMdd') + '.log')
    if (-not (Test-Path -LiteralPath $log)) { continue }
    try { $lines = @(Get-Content -LiteralPath $log -Tail 2000 -ErrorAction Stop) } catch { continue }
    for ($i = $lines.Count - 1; $i -ge 0; $i--) {
      if ([string]$lines[$i] -match "'(\d{3,15})': authorized on ([^\s,]+)") { return @{ login = $Matches[1]; server = $Matches[2].Trim("'") } }
    }
  }
  return $null
}

# Keeps the restart settings on the login and server MT really uses, so a fix made by hand in MT is not undone after a crash.
function Set-IniLogin($t, $login, $server) {
  $iniPath = Join-Path $t.dir 'config\copybridge.ini'
  if (-not (Test-Path -LiteralPath $iniPath)) { return }
  $text = [IO.File]::ReadAllText($iniPath)
  $new = $text
  if ($login) { $new = $new -replace '(?m)^Login=.*$', "Login=$login" }
  if ($server) { $new = $new -replace '(?m)^Server=.*$', "Server=$server" }
  if ($new -eq $text) { return }
  $enc = if ($t.platform -eq 'MT5') { [Text.Encoding]::Unicode } else { [Text.Encoding]::ASCII }
  [IO.File]::WriteAllText($iniPath, $new, $enc)
}

function Get-TerminalStates {
  return @($manifest.terminals | ForEach-Object {
      $h = Read-Health $_
      $mt = Get-MtLogin $_
      @{
        mt_login = "$($mt.login)"
        mt_server = "$($mt.server)"
        account_name = $_.account_name
        running = [bool](Get-TerminalProcess $_ | Select-Object -First 1)
        login_ok = Test-Path -LiteralPath (Join-Path $_.dir 'login.ok')
        restarts = [int]$h.restarts
        login_error = Get-LoginError $_
        ea_error = Get-EaError $_
      }
    })
}

function Update-Health {
  $states = @()
  try { $states = @(Get-TerminalStates) } catch {}
  try { $res = Invoke-Api @{ action = 'status'; install_key = $manifest.install_key; can_uninstall = $true; terminals = $states } } catch { return }
  if ($res.uninstall) { Remove-Group "Removed remotely from the website on $env:COMPUTERNAME" | Out-Null; exit }
  if ($res.desktop_command) { Invoke-DesktopCommand $res.desktop_command; $script:desktopActive = $true }
  foreach ($s in $states) {
    $t = $manifest.terminals | Where-Object { $_.account_name -eq $s.account_name } | Select-Object -First 1
    if ($t -and $s.mt_server) { Set-IniLogin $t $s.mt_login $s.mt_server }
  }
  foreach ($fix in @($res.server_fixed)) {
    if (-not $fix) { continue }
    $t = $manifest.terminals | Where-Object { $_.account_name -eq $fix.account_name } | Select-Object -First 1
    if (-not $t) { continue }
    $t | Add-Member -NotePropertyName server -NotePropertyValue $fix.server -Force
    $t | Add-Member -NotePropertyName learn -NotePropertyValue $true -Force
    $t | Add-Member -NotePropertyName replace -NotePropertyValue $true -Force
    $h = Read-Health $t
    $h.server_saved = $false
    [IO.File]::WriteAllText((Join-Path $t.dir 'health.json'), ($h | ConvertTo-Json -Compress))
    Add-SyncNote "$($t.account_name): server corrected to $($fix.server) on the website"
  }
  $list = @($res.accounts)
  Watch-EaUpdates $list
  foreach ($t in $manifest.terminals) {
    $acc = $list | Where-Object { $_.account_name -eq $t.account_name } | Select-Object -First 1
    if (-not $acc) { continue }
    $h = Read-Health $t
    $mark = Join-Path $t.dir 'login.ok'
    if ($acc.reconnect) {
      Write-Host "  $($t.account_name): reconnect requested from the website, restarting $($t.platform)"
      Stop-Terminal $t
      $h.offline = 0
      try { Invoke-Api @{ action = 'reconnect_done'; install_key = $manifest.install_key; account_name = $t.account_name } | Out-Null } catch {}
      Add-SyncNote "$($t.account_name): restarted on request"
    } elseif ($acc.online) {
      if (-not (Test-Path -LiteralPath $mark)) { [IO.File]::WriteAllText($mark, (Get-Date).ToString('s')) }
      if (-not $h.server_saved) { $h.server_saved = Send-ServerFile $t $h }
      $h.offline = 0; $h.restarts = 0; $h.was_online = $true
    } else {
      # Never restart a terminal that has never logged in: someone may be picking the broker by hand.
      $hasMark = Test-Path -LiteralPath $mark
      if ($acc.ever_online) { $h.was_online = $true }
      if (-not $hasMark -and -not $h.was_online) { continue }
      $p = Get-TerminalProcess $t | Select-Object -First 1
      if (-not $p) { continue }
      $upMinutes = 0
      try { $upMinutes = ((Get-Date) - $p.StartTime).TotalMinutes } catch {}
      # After two failed quick restarts keep retrying with the website's login details, but less often.
      $waitMinutes = if ($hasMark) { 5 } else { 15 }
      if ($upMinutes -lt $waitMinutes) { continue }
      $h.offline++
      if ($h.offline -ge 2) {
        Stop-Terminal $t
        $h.offline = 0; $h.restarts++
        if ($h.restarts -ge 2) { Remove-Item -LiteralPath $mark -Force -ErrorAction SilentlyContinue; $h.restarts = 0 }
      }
    }
    [IO.File]::WriteAllText((Join-Path $t.dir 'health.json'), ($h | ConvertTo-Json -Compress))
  }
}

function Start-Terminals {
  $mutex = New-Object Threading.Mutex($false, ('Global\CopyTerminals_' + (Split-Path $PSScriptRoot -Leaf)))
  try { if (-not $mutex.WaitOne(0)) { return 0 } } catch [Threading.AbandonedMutexException] {}
  $started = 0
  foreach ($t in $manifest.terminals) {
    if (-not (Get-TerminalProcess $t)) {
      Start-Process -FilePath (Join-Path $t.dir $t.exe) -ArgumentList (Get-LaunchArgs $t) -WorkingDirectory $t.dir
      $started++
      Start-Sleep -Milliseconds 800
    }
  }
  $mutex.ReleaseMutex()
  return $started
}

function Stop-Terminals {
  foreach ($t in $manifest.terminals) {
    foreach ($p in @(Get-TerminalProcess $t)) { try { $p.CloseMainWindow() | Out-Null } catch {} }
  }
  Start-Sleep -Seconds 5
  foreach ($t in $manifest.terminals) {
    foreach ($p in @(Get-TerminalProcess $t)) { try { Stop-Process -Id $p.Id -Force } catch {} }
  }
  Start-Sleep -Seconds 2
}

function Stop-Group {
  $ans = Show-Box ("Close all MT terminals of this group?`n`n" +
    "They will NOT reopen automatically until you click 'Start all'.") 'YesNo' 'Question'
  if ($ans -ne 'Yes') { return }
  [IO.File]::WriteAllText($pausedFlag, (Get-Date).ToString('s'))
  Stop-Terminals
}

function Set-Tiles {
  $total = @($manifest.terminals).Count
  $deadline = (Get-Date).AddSeconds(180)
  do {
    $handles = Get-TerminalWindows
    if (@($handles | Where-Object { $_ -ne [IntPtr]::Zero }).Count -ge $total) { break }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  # MT moves its window back to the last saved spot shortly after it opens, and slow starters show up late, so tile a few more times.
  foreach ($pause in @(3, 10, 20)) {
    Start-Sleep -Seconds $pause
    Move-Tiles (Get-TerminalWindows)
  }
}

# One entry per terminal in manifest order (Zero when its window is not open yet), so pages stay stable.
function Get-TerminalWindows {
  return @(foreach ($t in $manifest.terminals) {
      $p = Get-TerminalProcess $t | Select-Object -First 1
      if ($p) { $p.Refresh(); $p.MainWindowHandle } else { [IntPtr]::Zero }
    })
}

$layoutFile = Join-Path $PSScriptRoot 'layout.json'
$pageFile = Join-Path $PSScriptRoot 'page.txt'

function Read-Layout {
  $saved = @{}
  if (Test-Path -LiteralPath $layoutFile) {
    try {
      $obj = [IO.File]::ReadAllText($layoutFile) | ConvertFrom-Json
      foreach ($p in $obj.PSObject.Properties) { $saved[$p.Name] = $p.Value }
    } catch {}
  }
  return $saved
}

# MT will not shrink below its own minimum size; shrink one window per platform and read back what it allowed.
function Measure-MinSize($h, $area) {
  [CtWin]::ShowWindow($h, 9) | Out-Null
  [CtWin]::MoveWindow($h, $area.X, $area.Y, 50, 50, $true) | Out-Null
  Start-Sleep -Milliseconds 400
  $r = New-Object CtWin+RECT
  [CtWin]::GetWindowRect($h, [ref]$r) | Out-Null
  return @{ w = [math]::Max(200, $r.Right - $r.Left); h = [math]::Max(150, $r.Bottom - $r.Top) }
}

function Get-MinSize($handles, $area, $saved) {
  $minW = 0; $minH = 0
  foreach ($platform in @('MT4', 'MT5')) {
    $size = $saved[$platform]
    if (-not $size) {
      for ($i = 0; $i -lt $handles.Count; $i++) {
        if ($handles[$i] -ne [IntPtr]::Zero -and $manifest.terminals[$i].platform -eq $platform) {
          $size = Measure-MinSize $handles[$i] $area
          $saved[$platform] = $size
          break
        }
      }
    }
    if ($size) { $minW = [math]::Max($minW, [int]$size.w); $minH = [math]::Max($minH, [int]$size.h) }
  }
  return @{ w = [math]::Max(200, $minW); h = [math]::Max(150, $minH) }
}

# As few pages as possible, then the MT spread evenly over them, each tile as large as possible.
function Get-PageLayout($n, $min, $area) {
  $maxCols = [math]::Max(1, [math]::Floor($area.Width / $min.w))
  $maxRows = [math]::Max(1, [math]::Floor($area.Height / $min.h))
  $fit = $maxCols * $maxRows
  $pages = [math]::Max(1, [math]::Ceiling($n / $fit))
  $perPage = [math]::Ceiling($n / $pages)
  $cols = [math]::Min($maxCols, $perPage)
  $bestScore = -1
  for ($c = 1; $c -le [math]::Min($maxCols, $perPage); $c++) {
    $r = [math]::Ceiling($perPage / $c)
    if ($r -gt $maxRows) { continue }
    $score = [math]::Min($area.Width / $c, ($area.Height / $r) * 1.6)
    if ($score -gt $bestScore) { $bestScore = $score; $cols = $c }
  }
  return @{ fit = $fit; pages = $pages; perPage = $perPage; cols = $cols; rows = [math]::Ceiling($perPage / $cols) }
}

function Add-SyncNote($text) {
  $old = ''
  if (Test-Path -LiteralPath $syncNote) { $old = [IO.File]::ReadAllText($syncNote) }
  if ($old) { $text = "$old; $text" } else { $text = (Get-Date -Format 'yyyy-MM-dd HH:mm') + ' ' + $text }
  [IO.File]::WriteAllText($syncNote, $text)
}

function Move-Tiles($handles, [switch]$Next) {
  $n = $handles.Count
  $open = @($handles | Where-Object { $_ -ne [IntPtr]::Zero }).Count
  if ($open -eq 0) { return "No MT window found ($n MT in this group, session $([Diagnostics.Process]::GetCurrentProcess().SessionId) as $env:USERNAME)" }
  $area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $saved = Read-Layout
  $min = Get-MinSize $handles $area $saved
  $L = Get-PageLayout $n $min $area

  $fitText = "Screen $($area.Width)x$($area.Height) fits $($L.fit) MT without overlap: $n MT on $($L.pages) page(s)"
  if ($saved['fit'] -ne $fitText) {
    $saved['fit'] = $fitText
    Add-SyncNote $fitText
  }
  [IO.File]::WriteAllText($layoutFile, ($saved | ConvertTo-Json -Depth 4))

  $page = 0
  if (Test-Path -LiteralPath $pageFile) { [int]::TryParse([IO.File]::ReadAllText($pageFile).Trim(), [ref]$page) | Out-Null }
  if ($Next) { $page++ }
  if ($page -ge $L.pages -or $page -lt 0) { $page = 0 }
  [IO.File]::WriteAllText($pageFile, "$page")

  $first = $page * $L.perPage
  $last = [math]::Min($n, $first + $L.perPage) - 1
  for ($i = 0; $i -lt $n; $i++) {
    if ($handles[$i] -ne [IntPtr]::Zero -and ($i -lt $first -or $i -gt $last)) { [CtWin]::ShowWindow($handles[$i], 7) | Out-Null }
  }
  $w = [math]::Floor($area.Width / $L.cols)
  $h = [math]::Floor($area.Height / $L.rows)
  for ($i = $first; $i -le $last; $i++) {
    if ($handles[$i] -eq [IntPtr]::Zero) { continue }
    $slot = $i - $first
    $x = $area.X + ($slot % $L.cols) * $w
    $y = $area.Y + [math]::Floor($slot / $L.cols) * $h
    [CtWin]::ShowWindow($handles[$i], 9) | Out-Null
    [CtWin]::MoveWindow($handles[$i], [int]$x, [int]$y, [int]$w, [int]$h, $true) | Out-Null
  }
  return "$open of $n MT windows moved, page $($page + 1) of $($L.pages), screen $($area.Width)x$($area.Height)"
}

$desktopActive = $false

function Invoke-DesktopCommand($cmd) {
  try {
    if ($cmd -eq 'nextpage') { $result = Move-Tiles (Get-TerminalWindows) -Next } else { $result = Move-Tiles (Get-TerminalWindows) }
  } catch { $result = "Error: $($_.Exception.Message)" }
  try { Invoke-Api @{ action = 'desktop_done'; install_key = $manifest.install_key; result = "$result" } | Out-Null } catch {}
}

# After a window button is pressed on the website, check every few seconds for a while so the next press reacts quickly.
function Watch-DesktopCommands {
  if (-not $script:desktopActive) { return }
  $until = (Get-Date).AddMinutes(3)
  while ((Get-Date) -lt $until) {
    Start-Sleep -Seconds 4
    try { $r = Invoke-Api @{ action = 'desktop_poll'; install_key = $manifest.install_key } } catch { continue }
    if ($r.desktop_command) {
      Invoke-DesktopCommand $r.desktop_command
      $until = (Get-Date).AddMinutes(3)
    }
  }
}

function Set-HiddenShortcut($path, $action) {
  $lnk = (New-Object -ComObject WScript.Shell).CreateShortcut($path)
  $lnk.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
  $lnk.Arguments = "//B //Nologo `"$runHidden`" $action"
  $lnk.WorkingDirectory = $PSScriptRoot
  if ($action -eq 'nextpage') { $lnk.Hotkey = 'CTRL+ALT+N' }
  $lnk.Save()
}

# Older installs: point desktop icons at the hidden launcher and add the Next page icon (Ctrl+Alt+N).
function Update-Shortcuts {
  if ((Get-Field 'launcher') -eq 'vbs2' -and @($manifest.shortcuts | Where-Object { "$_" -like '* - Next page.lnk' }).Count -gt 0) { return }
  Write-RunHidden
  $ok = $true
  $list = @($manifest.shortcuts | Where-Object { $_ })
  foreach ($path in $list) {
    if (-not (Test-Path -LiteralPath $path)) { continue }
    try {
      $lnk = (New-Object -ComObject WScript.Shell).CreateShortcut($path)
      if ($lnk.TargetPath -like '*powershell.exe' -and $lnk.Arguments -match '-WindowStyle Hidden .*-Action (\w+)') { Set-HiddenShortcut $path $Matches[1] }
      elseif ($lnk.TargetPath -like '*wscript.exe' -and $lnk.Arguments -match 'run-hidden\.vbs" (\w+)') { Set-HiddenShortcut $path $Matches[1] }
    } catch { $ok = $false }
  }
  if (@($list | Where-Object { "$_" -like '* - Next page.lnk' }).Count -eq 0) {
    $label = (($manifest.group_label -replace '[^\x20-\x7E]', '') -replace '[\\/:*?"<>|]', '_').Trim()
    if (-not $label) { $label = 'Copy Terminals' }
    $created = $null
    foreach ($desktop in @([Environment]::GetFolderPath('CommonDesktopDirectory'), [Environment]::GetFolderPath('Desktop'))) {
      $path = Join-Path $desktop "$label - Next page.lnk"
      try { Set-HiddenShortcut $path 'nextpage'; $created = $path; break } catch {}
    }
    if ($created) { $list += $created } else { $ok = $false }
    Set-Field 'shortcuts' $list
  }
  if ($ok) { Set-Field 'launcher' 'vbs2' }
  Save-Manifest
}

$Root = Split-Path $PSScriptRoot -Parent
$Mt5ServersDir = Join-Path $Root '_servers_MT5'
$Mt4ServersDir = Join-Path $Root '_servers_MT4'
$Spec = @{
  MT4 = @{ Exe = 'terminal.exe'; Editor = 'metaeditor.exe'; Mql = 'MQL4'; Ea = 'MT4LiveBridge'; Ext = 'mq4'; Compiled = 'ex4' }
  MT5 = @{ Exe = 'terminal64.exe'; Editor = 'metaeditor64.exe'; Mql = 'MQL5'; Ea = 'MT5LiveBridge'; Ext = 'mq5'; Compiled = 'ex5' }
}
$syncStamp = Join-Path $PSScriptRoot 'sync.last'
$syncNote = Join-Path $PSScriptRoot 'sync.note'

function Get-ShortCode($text) {
  $hash = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($text))
  return (($hash[0..3] | ForEach-Object { $_.ToString('X2') }) -join '')
}

function Get-Field($name) { if ($manifest.PSObject.Properties[$name]) { return "$($manifest.$name)" } return '' }
function Set-Field($name, $value) { $manifest | Add-Member -NotePropertyName $name -NotePropertyValue $value -Force }

function Save-Manifest {
  [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'manifest.json'), ($manifest | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding $true))
}

function Get-SafeName($name) { return ($name -replace '[^A-Za-z0-9_.-]', '_') }

function Select-Mt5ServerFile($acc) {
  $files = @(Get-ChildItem -LiteralPath $Mt5ServersDir -Filter '*.dat' -File -ErrorAction SilentlyContinue)
  if ($files.Count -eq 0) { return $null }
  $server = Get-Norm $acc.server
  $broker = Get-Norm $acc.broker
  $best = $null; $bestScore = 0; $brokerFiles = @()
  foreach ($f in $files) {
    $parts = $f.BaseName -split '__', 2
    $label = Get-Norm $parts[0]
    if (-not $label -or $label -eq 'servers') { continue }
    if (-not ($server.Contains($label) -or ($broker -and ($broker.Contains($label) -or $label.Contains($broker))))) { continue }
    $brokerFiles += $f
    $tag = if ($parts.Count -gt 1) { Get-Norm $parts[1] } else { '' }
    $score = if (-not $tag) { 2 } elseif ($server.Contains($tag)) { 3 } else { 1 }
    if ($score -gt $bestScore) { $best = $f; $bestScore = $score }
  }
  if ($bestScore -ge 2) { return $best }
  if ($acc.server) {
    foreach ($f in @($brokerFiles + $files)) {
      $bytes = [IO.File]::ReadAllBytes($f.FullName)
      if ([Text.Encoding]::Unicode.GetString($bytes).Contains($acc.server) -or [Text.Encoding]::ASCII.GetString($bytes).Contains($acc.server)) { return $f }
    }
  }
  if ($best) { return $best }
  if ($files.Count -eq 1) { return $files[0] }
  return ($files | Where-Object { $_.BaseName -ieq 'servers' } | Select-Object -First 1)
}

function Save-ServerFiles($platform, $acc) {
  foreach ($f in @($acc.files)) {
    if (-not $f) { continue }
    $dir = if ($platform -eq 'MT5') { $Mt5ServersDir } elseif ($f.name -like '*__servers.ini') { $Mt4ServersDir } else { Join-Path $Root '_base_MT4\config' }
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    try { (New-Object Net.WebClient).DownloadFile($f.url, (Join-Path $dir $f.name)) } catch {}
  }
}

# Same setup the installer gives each account: a copy of the prepared base MT with login, chart and EA settings.
function Add-AccountTerminal($acc, $bridge) {
  $platform = if ($acc.platform -eq 'MT5') { 'MT5' } else { 'MT4' }
  $s = $Spec[$platform]
  $base = Join-Path $Root "_base_$platform"
  if (-not (Test-Path -LiteralPath (Join-Path $base $s.Exe))) { return "$($acc.account_name): this PC has no $platform yet, run a new install package once" }
  Save-ServerFiles $platform $acc

  $dir = Join-Path $PSScriptRoot (Get-SafeName $acc.account_name)
  Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
  robocopy $base $dir /E /NFL /NDL /NJH /NJS /NP /MT:8 | Out-Null
  if ($LASTEXITCODE -ge 8) { return "$($acc.account_name): could not copy MT files" }

  $preset = "AccountLabel=$($acc.account_name)`r`nSupabaseUrl=$($bridge.url)`r`nSupabaseKey=$($bridge.key)`r`nBridgeKey=$($acc.bridge_key)`r`n"
  $presetPath = Join-Path $dir "$($s.Mql)\Presets\copybridge.set"
  $iniPath = Join-Path $dir 'config\copybridge.ini'
  New-Item -ItemType Directory -Force -Path (Split-Path $presetPath), (Split-Path $iniPath) | Out-Null
  $server = "$($acc.server)".Trim()

  if ($platform -eq 'MT4') {
    $want = Get-Norm $server
    $learn = -not (Get-ChildItem -LiteralPath (Join-Path $dir 'config') -Filter '*.srv' -File -ErrorAction SilentlyContinue | Where-Object { (Get-Norm $_.BaseName) -eq $want })
    $shared = Get-ChildItem -LiteralPath $Mt4ServersDir -Filter '*__servers.ini' -File -ErrorAction SilentlyContinue | Where-Object { (Get-Norm (($_.BaseName -split '__', 2)[0])) -eq $want } | Select-Object -First 1
    if ($learn -and $shared) {
      Copy-Item -LiteralPath $shared.FullName -Destination (Join-Path $dir 'config\servers.ini') -Force
      $learn = $false
    }
    [IO.File]::WriteAllText($presetPath, $preset, [Text.Encoding]::ASCII)
    [IO.File]::WriteAllText($iniPath, (@(
          "Login=$($acc.login)", "Password=$($acc.password)", "Server=$server",
          'AutoConfiguration=true', 'EnableNews=false',
          'ExpertsEnable=true', 'ExpertsDllImport=false', 'ExpertsExpImport=true', 'ExpertsTrades=true',
          "Symbol=$($acc.chart_symbol)", 'Period=H1', "Expert=$($s.Ea)", 'ExpertParameters=copybridge.set'
        ) -join "`r`n"), [Text.Encoding]::ASCII)
    $launchArgs = "/portable `"config\copybridge.ini`""
  } else {
    $serverFile = Select-Mt5ServerFile $acc
    $learn = -not $serverFile
    if ($serverFile) { Copy-Item -LiteralPath $serverFile.FullName -Destination (Join-Path $dir 'config\servers.dat') -Force }
    [IO.File]::WriteAllText($presetPath, $preset, [Text.Encoding]::Unicode)
    [IO.File]::WriteAllText($iniPath, (@(
          '[Common]', "Login=$($acc.login)", "Password=$($acc.password)", "Server=$server", 'KeepPrivate=1', 'NewsEnable=0',
          '[Charts]', 'MaxBars=5000',
          '[Experts]', 'AllowLiveTrading=1', 'AllowDllImport=0', 'Enabled=1', 'Account=0', 'Profile=0',
          '[StartUp]', "Expert=$($s.Ea)", "Symbol=$($acc.chart_symbol)", 'Period=H1', 'ExpertParameters=copybridge.set'
        ) -join "`r`n"), [Text.Encoding]::Unicode)
    $launchArgs = "/portable /config:`"$iniPath`""
  }
  $t = [pscustomobject][ordered]@{ account_name = $acc.account_name; platform = $platform; type = $acc.type; dir = $dir; exe = $s.Exe; args = $launchArgs; server = $server; learn = [bool]$learn; ea_code = Get-BaseEaCode $platform }
  $manifest.terminals = @(@($manifest.terminals) + $t)
  Save-Manifest
  return "$($acc.account_name): MT added"
}

function Remove-AccountTerminal($t) {
  $prefix = $PSScriptRoot.TrimEnd('\') + '\'
  if (-not "$($t.dir)".StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { return }
  Stop-Terminal $t
  Remove-Item -LiteralPath $t.dir -Recurse -Force -ErrorAction SilentlyContinue
  $manifest.terminals = @($manifest.terminals | Where-Object { $_.account_name -ne $t.account_name })
  Save-Manifest
}

function Get-BaseEaCode($platform) {
  $file = Join-Path $Root "_base_$platform\copybridge.code"
  if (Test-Path -LiteralPath $file) { return [IO.File]::ReadAllText($file).Trim() }
  return Get-Field 'ea_code'
}

function Set-TerminalEaCode($t, $code) { $t | Add-Member -NotePropertyName 'ea_code' -NotePropertyValue $code -Force }

function Get-TerminalEaCode($t) {
  if ($t.PSObject.Properties['ea_code']) { return "$($t.ea_code)" }
  return Get-Field 'ea_code'
}

$onlineFile = Join-Path $PSScriptRoot 'online.txt'

function Get-TerminalExperts($t) { return Join-Path $t.dir "$($Spec[$t.platform].Mql)\Experts" }

function Test-EaWatch($t) { return [bool]($t.PSObject.Properties['ea_watch'] -and $t.ea_watch) }

# Each base MT compiles a new EA once; an account's MT then gets it only while that account holds no positions or orders.
# An MT whose EA file is unchanged is only re-tagged, never restarted. Otherwise the first MT of a platform is a trial on an
# online account; the rest follow (3 per sync) only after that trial reports back, and a silent trial is rolled back.
function Update-Ea($release, $busy) {
  if (-not $release.mt4 -or -not $release.mt5) { return $null }
  if ((Get-ShortCode ($release.mt4 + [char]0 + $release.mt5)) -ne $release.ea_code) { return 'EA update skipped: file fingerprint did not match' }
  if ((Get-Field 'ea_bad') -eq $release.ea_code) { return $null }
  $sources = @{ MT4 = $release.mt4; MT5 = $release.mt5 }
  $ready = @{}
  foreach ($platform in @('MT4', 'MT5')) {
    $s = $Spec[$platform]
    $base = Join-Path $Root "_base_$platform"
    if (-not (Test-Path -LiteralPath (Join-Path $base $s.Editor))) { continue }
    $mqlDir = Join-Path $base $s.Mql
    $experts = Join-Path $mqlDir 'Experts'
    $src = Join-Path $experts "$($s.Ea).$($s.Ext)"
    $compiled = Join-Path $experts "$($s.Ea).$($s.Compiled)"
    if ((Get-BaseEaCode $platform) -eq $release.ea_code -and (Test-Path -LiteralPath $compiled)) {
      $ready[$platform] = @{ src = $src; compiled = $compiled }
      continue
    }
    $backup = "$compiled.bak"
    if (Test-Path -LiteralPath $compiled) { Copy-Item -LiteralPath $compiled -Destination $backup -Force }
    [IO.File]::WriteAllText($src, $sources[$platform], (New-Object Text.UTF8Encoding $true))
    Remove-Item -LiteralPath $compiled -Force -ErrorAction SilentlyContinue
    try {
      Start-Process -FilePath (Join-Path $base $s.Editor) -ArgumentList @('/portable', "/compile:`"$src`"", "/inc:`"$mqlDir`"", '/log') -WorkingDirectory $base -Wait -WindowStyle Hidden
    } catch {}
    if (-not (Test-Path -LiteralPath $compiled)) {
      if (Test-Path -LiteralPath $backup) { Move-Item -LiteralPath $backup -Destination $compiled -Force }
      return "EA update failed: $platform could not compile the new EA, old EA kept"
    }
    Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
    [IO.File]::WriteAllText((Join-Path $base 'copybridge.code'), $release.ea_code)
    $ready[$platform] = @{ src = $src; compiled = $compiled }
  }
  $online = @()
  if (Test-Path -LiteralPath $onlineFile) { $online = @([IO.File]::ReadAllLines($onlineFile)) }
  $updated = @()
  $retagged = @()
  $waiting = @()
  $staged = @()
  $started = @{ MT4 = 0; MT5 = 0 }
  foreach ($t in @($manifest.terminals)) {
    if ((Get-TerminalEaCode $t) -eq $release.ea_code) { continue }
    $r = $ready[$t.platform]
    if (-not $r) { $waiting += $t.account_name; continue }
    $experts = Get-TerminalExperts $t
    $src = Join-Path $experts (Split-Path $r.src -Leaf)
    $compiled = Join-Path $experts (Split-Path $r.compiled -Leaf)
    $same = $false
    try { $same = (Test-Path -LiteralPath $compiled) -and ([IO.File]::ReadAllText($src) -eq $sources[$t.platform]) } catch {}
    if ($same) { Set-TerminalEaCode $t $release.ea_code; $retagged += $t.account_name; continue }
    if (@($busy) -contains $t.account_name) { $waiting += $t.account_name; continue }
    $trusted = (Get-Field "ea_ok_$($t.platform)") -eq $release.ea_code
    $isOnline = $online -contains $t.account_name
    if ($trusted) {
      if ($started[$t.platform] -ge 3) { $staged += $t.account_name; continue }
    } else {
      $watching = @($manifest.terminals | Where-Object { $_.platform -eq $t.platform -and (Test-EaWatch $_) }).Count
      if ($watching -gt 0 -or $started[$t.platform] -gt 0 -or -not $isOnline) { $staged += $t.account_name; continue }
    }
    Stop-Terminal $t
    New-Item -ItemType Directory -Force -Path $experts | Out-Null
    foreach ($f in @($src, $compiled)) { if (Test-Path -LiteralPath $f) { Copy-Item -LiteralPath $f -Destination "$f.prev" -Force } }
    Copy-Item -LiteralPath $r.src, $r.compiled -Destination $experts -Force
    $t | Add-Member -NotePropertyName ea_prev_code -NotePropertyValue (Get-TerminalEaCode $t) -Force
    $t | Add-Member -NotePropertyName ea_updated_at -NotePropertyValue (Get-Date).ToString('o') -Force
    $t | Add-Member -NotePropertyName ea_watch -NotePropertyValue $isOnline -Force
    Set-TerminalEaCode $t $release.ea_code
    $started[$t.platform]++
    $updated += $t.account_name
  }
  if ($waiting.Count -eq 0 -and $staged.Count -eq 0) { Set-Field 'ea_code' $release.ea_code }
  Save-Manifest
  if ($updated.Count -eq 0 -and $retagged.Count -eq 0) { return $null }
  $parts = @()
  if ($updated.Count -gt 0) { $parts += "EA $($release.ea_code) installed on: $($updated -join ', ')" }
  if ($retagged.Count -gt 0) { $parts += "$($retagged.Count) MT already had this EA file, not restarted" }
  if ($staged.Count -gt 0) { $parts += "$($staged.Count) MT follow after it is confirmed" }
  if ($waiting.Count -gt 0) { $parts += "$($waiting.Count) waiting for positions to close: $($waiting -join ', ')" }
  return $parts -join '; '
}

# Confirms or rolls back each freshly updated MT: back online within the window confirms the EA for its platform;
# still silent after 12 minutes restores the previous EA files and stops this EA version on this VDS.
function Watch-EaUpdates($list) {
  try { [IO.File]::WriteAllLines($onlineFile, [string[]]@($list | Where-Object { $_.online } | ForEach-Object { $_.account_name })) } catch {}
  $changed = $false
  foreach ($t in @($manifest.terminals)) {
    if (-not (Test-EaWatch $t)) { continue }
    $acc = $list | Where-Object { $_.account_name -eq $t.account_name } | Select-Object -First 1
    $minutes = 0
    try { $minutes = ((Get-Date) - [datetime]$t.ea_updated_at).TotalMinutes } catch { $minutes = 99 }
    $code = Get-TerminalEaCode $t
    if ($acc -and $acc.online -and $minutes -ge 3) {
      $t.ea_watch = $false
      Set-Field "ea_ok_$($t.platform)" $code
      Add-SyncNote "$($t.account_name): EA $code confirmed running, updating the other $($t.platform)"
      $changed = $true
    } elseif ($minutes -ge 12) {
      Stop-Terminal $t
      foreach ($f in @(Get-ChildItem -LiteralPath (Get-TerminalExperts $t) -Filter '*.prev' -ErrorAction SilentlyContinue)) {
        Copy-Item -LiteralPath $f.FullName -Destination ($f.FullName -replace '\.prev$', '') -Force
      }
      Set-TerminalEaCode $t "$($t.ea_prev_code)"
      $t.ea_watch = $false
      Set-Field 'ea_bad' $code
      Add-SyncNote "$($t.account_name): EA $code did not report back within 12 minutes, previous EA restored and this update stopped on this VDS"
      $changed = $true
    }
  }
  if ($changed) { Save-Manifest }
}

function Update-Control($release) {
  if (-not $release.control -or (Get-ShortCode $release.control) -ne $release.control_code) { return }
  [IO.File]::WriteAllText($PSCommandPath, $release.control, (New-Object Text.UTF8Encoding $true))
  Set-Field 'control_code' $release.control_code
  Save-Manifest
}

$collectorFile = Join-Path $PSScriptRoot 'collectServers.ps1'
$harvestStamp = Join-Path $PSScriptRoot 'harvest.last'

function Update-Collector($release) {
  if (-not $release.collector -or (Get-ShortCode $release.collector) -ne $release.collector_code) { return }
  [IO.File]::WriteAllText($collectorFile, $release.collector, (New-Object Text.UTF8Encoding $true))
  Set-Field 'collector_code' $release.collector_code
  Save-Manifest
}

# Every 6 hours: send server files of any other MT on this PC to the website's Broker Files library.
function Invoke-Harvest {
  if ((Get-Field 'harvest_off') -or -not (Test-Path -LiteralPath $collectorFile)) { return }
  if ((Test-Path -LiteralPath $harvestStamp) -and ((Get-Date) - (Get-Item -LiteralPath $harvestStamp).LastWriteTime).TotalHours -lt 6) { return }
  [IO.File]::WriteAllText($harvestStamp, (Get-Date).ToString('s'))
  try {
    . $collectorFile
    $send = { param($body) $body.install_key = $manifest.install_key; Invoke-Api $body }
    $r = Invoke-ServerHarvest $send (Join-Path $Root '_harvest_sent2.json') $Root 60
    if ($r.denied) { Set-Field 'harvest_off' '1'; Save-Manifest; return }
    if ($r.added -gt 0) { Add-SyncNote "Server files: $($r.added) new or updated in Broker Files" }
  } catch {}
}

# Every few minutes: follow the group on the website (add / remove MT) and pick up new EA and control versions.
function Invoke-Sync {
  if ((Test-Path -LiteralPath $syncStamp) -and ((Get-Date) - (Get-Item -LiteralPath $syncStamp).LastWriteTime).TotalMinutes -lt 5) { return $false }
  [IO.File]::WriteAllText($syncStamp, (Get-Date).ToString('s'))
  $note = ''
  if (Test-Path -LiteralPath $syncNote) { $note = [IO.File]::ReadAllText($syncNote) }
  try {
    $res = Invoke-Api @{
      action = 'sync'; install_key = $manifest.install_key; message = $note; can_uninstall = $true
      have = @($manifest.terminals | ForEach-Object { $_.account_name })
      ea_code = Get-Field 'ea_code'; control_code = Get-Field 'control_code'; collector_code = Get-Field 'collector_code'
    }
  } catch { return $false }
  if ($res.uninstall) { Remove-Group "Removed remotely from the website on $env:COMPUTERNAME" | Out-Null; exit }
  if ($note) { Remove-Item -LiteralPath $syncNote -Force -ErrorAction SilentlyContinue }

  $notes = @()
  $changed = $false
  $wanted = @($res.wanted | Where-Object { $_ })
  if ($wanted.Count -gt 0) {
    foreach ($t in @($manifest.terminals | Where-Object { $wanted -notcontains $_.account_name })) {
      Remove-AccountTerminal $t
      $notes += "$($t.account_name): MT removed"
      $changed = $true
    }
  }
  foreach ($acc in @($res.add | Where-Object { $_ })) {
    try { $notes += Add-AccountTerminal $acc $res.bridge; $changed = $true } catch { $notes += "$($acc.account_name): could not add MT ($_)" }
  }
  if ($res.release) {
    Update-Control $res.release
    Update-Collector $res.release
    $eaNote = Update-Ea $res.release @($res.busy | Where-Object { $_ })
    if ($eaNote) { $notes += $eaNote; $changed = $true }
  }
  if ($notes.Count -gt 0) { [IO.File]::WriteAllText($syncNote, ((Get-Date -Format 'yyyy-MM-dd HH:mm') + ' ' + ($notes -join '; '))) }
  return $changed
}

function Test-Admin {
  return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Shared by the Uninstall shortcut and remote uninstall from the website. Returns $true if PC settings were restored.
function Remove-Group($message) {
  $leftTasks = @()
  foreach ($task in @($manifest.tasks)) {
    if (-not $task) { continue }
    try { Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction Stop } catch { $leftTasks += $task }
  }
  Stop-Terminals

  foreach ($s in $manifest.shortcuts) { Remove-Item -LiteralPath $s -Force -ErrorAction SilentlyContinue }
  # A leftover task only runs a launcher whose files are gone, so it does nothing.
  if ($leftTasks.Count -gt 0) { $message += " (Windows task left inactive: $($leftTasks -join ', '))" }
  try { Invoke-Api @{ action = 'report'; install_key = $manifest.install_key; status = 'uninstalled'; message = $message } | Out-Null } catch {}

  Set-Location $env:TEMP
  $groupDir = $PSScriptRoot
  $root = Split-Path $groupDir -Parent
  # Manifest goes first: without it the watchdog cannot start MT again even if some files stay locked.
  Remove-Item -LiteralPath (Join-Path $groupDir 'manifest.json') -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $groupDir -Recurse -Force -ErrorAction SilentlyContinue
  $others = @(Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | Where-Object { -not $_.Name.StartsWith('_') })
  $restored = $false
  if ($others.Count -eq 0) {
    $pcSettings = Join-Path $root 'pc_settings.ps1'
    if ((Test-Admin) -and (Test-Path -LiteralPath $pcSettings)) {
      try { . $pcSettings; Restore-PcSettings $root; $restored = $true } catch {}
    }
    if ($restored -or -not (Test-Path -LiteralPath $pcSettings)) { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
  }
  return $restored
}

function Uninstall-Group {
  if (-not (Test-Admin)) {
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Action', 'uninstall')
    return
  }
  $count = @($manifest.terminals).Count

  $openList = @()
  $checked = $true
  try {
    $status = Invoke-Api @{ action = 'status'; install_key = $manifest.install_key }
    $openList = @($status.accounts | Where-Object { $_.open_positions -gt 0 } | ForEach-Object { "$($_.account_name): $($_.open_positions)" })
  } catch { $checked = $false }

  if ($openList.Count -gt 0) {
    $ans = Show-Box ("These accounts still have OPEN POSITIONS:`n`n" + ($openList -join "`n") + "`n`nRemoving the terminals stops copying and closing for these trades. Continue anyway?") 'YesNo' 'Warning'
    if ($ans -ne 'Yes') { return }
  } elseif (-not $checked) {
    $ans = Show-Box "Could not check for open positions (no internet?). Continue anyway?" 'YesNo' 'Warning'
    if ($ans -ne 'Yes') { return }
  }

  $ans = Show-Box "Remove all $count MT terminals of this group from this PC?" 'YesNo' 'Question'
  if ($ans -ne 'Yes') { return }

  $restored = Remove-Group "Removed from $env:COMPUTERNAME"
  $groupDir = $PSScriptRoot
  $restoredNote = ''
  if ($restored) { $restoredNote = "`n`nThe PC's original power, sleep and Windows Update settings were restored." }

  if (Test-Path -LiteralPath $groupDir) {
    Show-Box "Most files were removed, but some are still in use. Restart the PC and delete this folder:`n$groupDir" 'OK' 'Warning' | Out-Null
  } else {
    Show-Box ("All $count terminals of this group were removed." + $restoredNote) | Out-Null
  }
}

switch ($Action) {
  'start' {
    Remove-Item -LiteralPath $pausedFlag -Force -ErrorAction SilentlyContinue
    Start-Terminals | Out-Null
    Set-Tiles
  }
  'stop' { Stop-Group }
  'arrange' { Move-Tiles (Get-TerminalWindows) | Out-Null }
  'nextpage' { Move-Tiles (Get-TerminalWindows) -Next | Out-Null }
  'watchdog' {
    Update-Shortcuts
    $changed = Invoke-Sync
    if (-not (Test-Path -LiteralPath $pausedFlag)) {
      Update-Health
      if ((Start-Terminals) -gt 0 -or $changed) { Set-Tiles }
      Watch-DesktopCommands
    }
    Invoke-Harvest
  }
  'uninstall' { Uninstall-Group }
}
