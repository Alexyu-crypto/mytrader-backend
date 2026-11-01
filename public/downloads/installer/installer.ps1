$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
Add-Type -AssemblyName System.Windows.Forms
# QuickEdit pauses the whole script when the console window is clicked.
try {
  Add-Type -Namespace CT -Name Con -MemberDefinition '[DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int h); [DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr h, out uint m); [DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr h, uint m);'
  $conIn = [CT.Con]::GetStdHandle(-10)
  [uint32]$conMode = 0
  if ([CT.Con]::GetConsoleMode($conIn, [ref]$conMode)) { [CT.Con]::SetConsoleMode($conIn, [uint32](($conMode -band 0xFFBF) -bor 0x80)) | Out-Null }
} catch {}

$FunctionUrl = '__FUNCTION_URL__'
$AnonKey = '__ANON_KEY__'
$InstallCode = '__INSTALL_CODE__'
$GroupSlug = '__GROUP_SLUG__'
$GroupLabel = '__GROUP_LABEL__'
$EaSource = @{ MT4 = '__MT4_EA_B64__'; MT5 = '__MT5_EA_B64__' }
$ControlSource = '__CONTROL_B64__'
$PcSettingsSource = '__PCSETTINGS_B64__'

$Root = Join-Path $env:SystemDrive 'CopyTerminals'
$GroupDir = Join-Path $Root $GroupSlug
$Title = "$GroupLabel - Copy Terminals Installer"
$Spec = @{
  MT4 = @{ Exe = 'terminal.exe'; Editor = 'metaeditor.exe'; Mql = 'MQL4'; Ea = 'MT4LiveBridge'; Ext = 'mq4'; Compiled = 'ex4'; RamGB = 0.2 }
  MT5 = @{ Exe = 'terminal64.exe'; Editor = 'metaeditor64.exe'; Mql = 'MQL5'; Ea = 'MT5LiveBridge'; Ext = 'mq5'; Compiled = 'ex5'; RamGB = 0.35 }
}
$ReserveRamGB = 2
$RamShare = 0.7
$DiskPerTerminalGB = 0.5
$Mt5ServersDir = Join-Path $Root '_servers_MT5'
$Mt4ServersDir = Join-Path $Root '_servers_MT4'
$ReserveDiskGB = 5
$Script:InstallKey = $null

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Step($text) { Write-Host ''; Write-Host "==> $text" -ForegroundColor Cyan }
function Show-Box($text, $buttons = 'OK', $icon = 'Information') {
  return [System.Windows.Forms.MessageBox]::Show($text, $Title, $buttons, $icon)
}

function Test-Admin {
  return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-Api($body) {
  $json = $body | ConvertTo-Json -Depth 6 -Compress
  $headers = @{ apikey = $AnonKey; Authorization = "Bearer $AnonKey" }
  try {
    $res = Invoke-WebRequest -Uri $FunctionUrl -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($json)) -ContentType 'application/json; charset=utf-8' -Headers $headers -UseBasicParsing -TimeoutSec 60
    return [Text.Encoding]::UTF8.GetString($res.RawContentStream.ToArray()) | ConvertFrom-Json
  } catch {
    $msg = $_.Exception.Message
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { try { $msg = ($_.ErrorDetails.Message | ConvertFrom-Json).error } catch {} }
    throw $msg
  }
}

function Send-Report($status, $message, $extra = @{}) {
  if (-not $Script:InstallKey) { return }
  $body = @{ action = 'report'; install_key = $Script:InstallKey; status = $status; message = $message }
  foreach ($k in $extra.Keys) { $body[$k] = $extra[$k] }
  try { Invoke-Api $body | Out-Null } catch { Say "  (could not send status to website: $_)" 'DarkYellow' }
}

function Write-Utf8Bom($path, $text) { [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding $true)) }
function Write-Ascii($path, $text) { [IO.File]::WriteAllText($path, $text, [Text.Encoding]::ASCII) }
function Write-Unicode($path, $text) { [IO.File]::WriteAllText($path, $text, [Text.Encoding]::Unicode) }
# Windows Terminal ignores -WindowStyle Hidden, so desktop icons start PowerShell through this instead.
$RunHiddenVbs = @'
Set fso = CreateObject("Scripting.FileSystemObject")
p = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "control.ps1")
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & p & """ -Action " & WScript.Arguments(0) & " -Quiet", 0, False
'@
function From-B64($b64) { return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) }
# Same fingerprint the website gives each EA / control release, so the PC knows which version it runs.
function Get-ShortCode($text) {
  $hash = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($text))
  return (($hash[0..3] | ForEach-Object { $_.ToString('X2') }) -join '')
}
. ([ScriptBlock]::Create((From-B64 $PcSettingsSource)))

function Get-TerminalProcesses($exeName) {
  $name = [IO.Path]::GetFileNameWithoutExtension($exeName)
  return @(Get-Process -Name $name -ErrorAction SilentlyContinue)
}

function Stop-GroupTerminals {
  $prefix = $GroupDir.TrimEnd('\') + '\'
  $procs = @(Get-Process -Name terminal, terminal64 -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) })
  foreach ($p in $procs) { try { $p.CloseMainWindow() | Out-Null } catch {} }
  if ($procs.Count) { Start-Sleep -Seconds 5 }
  foreach ($p in $procs) { try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {} }
}

function Get-Hardware {
  $cs = Get-CimInstance Win32_ComputerSystem
  $os = Get-CimInstance Win32_OperatingSystem
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  $drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($env:SystemDrive)'"
  $diskType = 'Unknown'
  try {
    $num = (Get-Partition -DriveLetter $env:SystemDrive.TrimEnd(':') | Select-Object -First 1).DiskNumber
    $pd = Get-PhysicalDisk | Where-Object { $_.DeviceId -eq "$num" } | Select-Object -First 1
    if ($pd) { $diskType = "$($pd.MediaType)" }
  } catch {}
  $prefix = $GroupDir.TrimEnd('\') + '\'
  $others = @(Get-Process -Name terminal, terminal64 -ErrorAction SilentlyContinue | Where-Object { -not ($_.Path -and $_.Path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) })
  $area = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  return [ordered]@{
    computer = $env:COMPUTERNAME
    os = "$($os.Caption)"
    os64 = [Environment]::Is64BitOperatingSystem
    cpu = "$($cpu.Name)".Trim()
    cores = [Environment]::ProcessorCount
    ram_gb = [math]::Round($cs.TotalPhysicalMemory / 1GB, 1)
    free_disk_gb = [math]::Round($drive.FreeSpace / 1GB, 1)
    disk_type = $diskType
    screen = "$($area.Width)x$($area.Height)"
    other_terminals = $others.Count
  }
}

function Get-Capacity($hw, $accounts) {
  $n4 = @($accounts | Where-Object { $_.platform -eq 'MT4' }).Count
  $n5 = @($accounts | Where-Object { $_.platform -eq 'MT5' }).Count
  $n = $n4 + $n5
  $avgRam = ($n4 * $Spec.MT4.RamGB + $n5 * $Spec.MT5.RamGB) / [math]::Max($n, 1)
  $ramBudget = [math]::Max(0, ($hw.ram_gb - $ReserveRamGB) * $RamShare)
  $perCore = 3
  if ($hw.disk_type -eq 'HDD') { $perCore = 2 }
  $byRam = [math]::Floor($ramBudget / $avgRam)
  $byCpu = $hw.cores * $perCore
  $byDisk = [math]::Floor([math]::Max(0, $hw.free_disk_gb - $ReserveDiskGB) / $DiskPerTerminalGB)
  $total = [math]::Min([math]::Min($byRam, $byCpu), $byDisk)
  $available = [math]::Max(0, $total - $hw.other_terminals)
  $limit = 'RAM'
  if ($byCpu -eq $total) { $limit = 'CPU' }
  if ($byDisk -eq $total) { $limit = 'Disk' }
  return [ordered]@{ needed = $n; mt4 = $n4; mt5 = $n5; by_ram = $byRam; by_cpu = $byCpu; by_disk = $byDisk; total = $total; available = $available; limit = $limit }
}

function Find-InstalledTerminal($platform) {
  $s = $Spec[$platform]
  $roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
  $found = foreach ($r in $roots) {
    Get-ChildItem -LiteralPath $r -Directory -ErrorAction SilentlyContinue | Where-Object {
      (Test-Path (Join-Path $_.FullName $s.Exe)) -and (Test-Path (Join-Path $_.FullName $s.Editor))
    }
  }
  return $found | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

function Stop-InstallerLaunchedTerminal($folder) {
  $prefix = $folder.TrimEnd('\') + '\'
  Get-Process -Name terminal, terminal64 -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { try { Stop-Process -Id $_.Id -Force } catch {} }
}

function Save-Download($url, $path, $label) {
  for ($try = 1; $try -le 3; $try++) {
    try {
      $req = [Net.HttpWebRequest]::Create($url)
      $req.Timeout = 30000
      $req.ReadWriteTimeout = 60000
      $req.UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      $res = $req.GetResponse()
      $total = $res.ContentLength
      $in = $res.GetResponseStream()
      $out = [IO.File]::Create($path)
      $done = 0
      try {
        $buf = New-Object byte[] 262144
        $shown = Get-Date
        while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
          $out.Write($buf, 0, $n)
          $done += $n
          if (((Get-Date) - $shown).TotalSeconds -ge 2) {
            $mb = [math]::Round($done / 1MB, 1)
            if ($total -gt 0) { Write-Host -NoNewline "`r    $mb / $([math]::Round($total / 1MB, 1)) MB   " } else { Write-Host -NoNewline "`r    $mb MB   " }
            $shown = Get-Date
          }
        }
      } finally { $out.Close(); $in.Close(); $res.Close() }
      Write-Host ''
      if ($done -eq 0 -or ($total -gt 0 -and $done -ne $total)) { throw 'download was incomplete' }
      return
    } catch {
      Write-Host ''
      Say "  Download attempt $try of 3 failed: $($_.Exception.Message)" 'DarkYellow'
      if ($try -eq 3) { throw "Could not download $label. Check this PC's internet or upload the setup on the website." }
      Start-Sleep -Seconds 5
    }
  }
}

function Install-FromSetup($platform, $setupPath) {
  Say "  Running $platform setup silently..."
  $before = Find-InstalledTerminal $platform
  $setupProc = Start-Process -FilePath $setupPath -ArgumentList '/auto' -PassThru
  # Wait for the setup process only; it may leave MT running, which must not block us.
  if (-not $setupProc.WaitForExit(15 * 60 * 1000)) { Say "  $platform setup is taking long, continuing to check..." 'DarkYellow' }
  $deadline = (Get-Date).AddMinutes(6)
  do {
    $now = Find-InstalledTerminal $platform
    if ($now -and (-not $before -or $now.FullName -ne $before.FullName -or $now.LastWriteTime -gt $before.LastWriteTime)) { break }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $deadline)
  if (-not $now) { throw "$platform setup finished but no terminal was found." }
  Start-Sleep -Seconds 5
  Stop-InstallerLaunchedTerminal $now.FullName
  return $now
}

function Get-SourceTerminal($platform, $installerUrl) {
  $existing = Find-InstalledTerminal $platform
  if ($existing) { Say "  Using installed $platform at $($existing.FullName)"; return $existing.FullName }

  if ($installerUrl) {
    $setup = Join-Path $env:TEMP "copyterminals_$($platform.ToLower())_setup.exe"
    Say "  Downloading $platform setup..."
    Save-Download $installerUrl $setup "$platform setup"
    return (Install-FromSetup $platform $setup).FullName
  }

  Show-Box "No $platform is installed on this PC and no $platform setup is uploaded on the website (Broker Files page).`n`nPlease choose the broker's $platform setup file (.exe) or an existing $($Spec[$platform].Exe)." | Out-Null
  $dlg = New-Object System.Windows.Forms.OpenFileDialog
  $dlg.Filter = 'Programs (*.exe)|*.exe'
  $dlg.Title = "Choose $platform setup or terminal"
  if ($dlg.ShowDialog() -ne 'OK') { throw "No $platform terminal was chosen." }
  if ([IO.Path]::GetFileName($dlg.FileName) -ieq $Spec[$platform].Exe) { return (Split-Path $dlg.FileName -Parent) }
  return (Install-FromSetup $platform $dlg.FileName).FullName
}

function Set-Mt4WebRequestUrl($baseDir, $url) {
  $path = Join-Path $baseDir 'config\common.ini'
  $enc = [Text.Encoding]::Default
  $lines = @()
  if (Test-Path -LiteralPath $path) {
    $bytes = [IO.File]::ReadAllBytes($path)
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) { $enc = [Text.Encoding]::Unicode }
    $lines = @($enc.GetString($bytes).TrimStart([char]0xFEFF) -split "`r?`n")
  }
  $out = New-Object Collections.Generic.List[string]
  $inExperts = $false; $seen = $false; $flagDone = $false; $urlDone = $false
  foreach ($line in $lines) {
    if ($line -match '^\s*\[(.+)\]\s*$') {
      if ($inExperts) {
        if (-not $flagDone) { $out.Add('WebRequest=1') }
        if (-not $urlDone) { $out.Add("WebRequestUrl=$url") }
        $flagDone = $true; $urlDone = $true
      }
      $inExperts = $Matches[1] -ieq 'Experts'
      if ($inExperts) { $seen = $true }
      $out.Add($line); continue
    }
    if ($inExperts -and $line -match '^\s*WebRequest\s*=') { $out.Add('WebRequest=1'); $flagDone = $true; continue }
    if ($inExperts -and $line -match '^\s*WebRequestUrl\s*=') {
      $urls = @(($line -replace '^\s*WebRequestUrl\s*=', '') -split ';' | Where-Object { $_.Trim() })
      if (-not ($urls | Where-Object { $_.Trim().TrimEnd('/') -ieq $url })) { $urls += $url }
      $out.Add('WebRequestUrl=' + ($urls -join ';')); $urlDone = $true; continue
    }
    $out.Add($line)
  }
  if ($inExperts) {
    if (-not $flagDone) { $out.Add('WebRequest=1') }
    if (-not $urlDone) { $out.Add("WebRequestUrl=$url") }
  } elseif (-not $seen) {
    while ($out.Count -gt 0 -and -not $out[$out.Count - 1].Trim()) { $out.RemoveAt($out.Count - 1) }
    $out.Add('[Experts]'); $out.Add('WebRequest=1'); $out.Add("WebRequestUrl=$url")
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
  $text = ($out -join "`r`n") + "`r`n"
  if ($enc -eq [Text.Encoding]::Unicode) { [IO.File]::WriteAllText($path, $text, (New-Object Text.UnicodeEncoding($false, $true))) }
  else { [IO.File]::WriteAllText($path, $text, $enc) }
}

function Test-WebRequestAllowed($baseDir, $hostName) {
  if (Test-Path -LiteralPath (Join-Path $baseDir 'webrequest.ok')) { return $true }
  $cfg = Join-Path $baseDir 'config'
  foreach ($f in @(Get-ChildItem -LiteralPath $cfg -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -ne '.srv' -and $_.Name -ne 'servers.dat' })) {
    $bytes = [IO.File]::ReadAllBytes($f.FullName)
    if ([Text.Encoding]::ASCII.GetString($bytes).Contains($hostName) -or [Text.Encoding]::Unicode.GetString($bytes).Contains($hostName)) { return $true }
  }
  return $false
}

function Initialize-Base($platform, $cfg) {
  $s = $Spec[$platform]
  $base = Join-Path $Root "_base_$platform"
  $hostName = ([Uri]$cfg.bridge.url).Host
  $baseUrl = "https://$hostName"

  if (-not (Test-Path (Join-Path $base $s.Exe))) {
    $source = Get-SourceTerminal $platform $cfg.installers.$platform
    Say "  Preparing base $platform..."
    New-Item -ItemType Directory -Force -Path $base | Out-Null
    robocopy $source $base /E /NFL /NDL /NJH /NJS /NP /MT:8 | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Could not copy $platform files." }
  }

  $configDir = Join-Path $base 'config'
  New-Item -ItemType Directory -Force -Path $configDir | Out-Null
  # Every broker's MT5 file is named servers.dat, so they are kept apart and matched per account.
  $saveDir = $configDir
  if ($platform -eq 'MT5') {
    $saveDir = $Mt5ServersDir
    Remove-Item -LiteralPath $saveDir -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $saveDir | Out-Null
  } else {
    Remove-Item -LiteralPath $Mt4ServersDir -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $Mt4ServersDir | Out-Null
  }
  foreach ($f in @($cfg.server_files | Where-Object { $_.platform -eq $platform })) {
    # Shared MT4 servers.ini files all have the same real name, so they wait apart until an account needs one.
    $dest = if ($f.name -like '*__servers.ini') { Join-Path $Mt4ServersDir $f.name } else { Join-Path $saveDir $f.name }
    try { (New-Object Net.WebClient).DownloadFile($f.url, $dest) } catch { Say "  Could not download server file $($f.name)" 'DarkYellow' }
  }

  if ($platform -eq 'MT4') { Set-Mt4WebRequestUrl $base $baseUrl }

  $historyMark = Join-Path $base 'all_history.ok'
  $needHistory = ($platform -eq 'MT4') -and -not (Test-Path -LiteralPath $historyMark)
  while ($needHistory -or -not (Test-WebRequestAllowed $base $hostName)) {
    $needUrl = -not (Test-WebRequestAllowed $base $hostName)
    Set-Clipboard -Value $baseUrl
    $proc = Start-Process -FilePath (Join-Path $base $s.Exe) -ArgumentList '/portable' -WorkingDirectory $base -PassThru
    $steps = ''
    $n = 1
    if ($needUrl) {
      $steps += "1. Tools > Options > Expert Advisors`n" +
        "2. Tick 'Allow automated trading' and 'Allow WebRequest for listed URL'`n" +
        "3. Add this URL (already copied, press Ctrl+V):`n   $baseUrl`n"
      $n = 4
      if ($platform -eq 'MT4') { $steps += "4. Charts tab: Max bars in chart = 5000, then OK`n"; $n = 5 }
    }
    if ($needHistory) {
      $steps += "$n. Press Ctrl+T > 'Account History' tab > right-click > 'All History'`n   (so the EA can upload the full trade history)`n"
    }
    Show-Box ("ONE-TIME SETUP for $platform on this PC (copied to every $platform terminal).`n`n" +
      "In the $platform window that just opened (close any login / open account popup first):`n`n" + $steps +
      "`nThen CLOSE MT (File > Exit) and click OK here.") | Out-Null
    # MT saves its settings while exiting, so it must close by itself; killing it loses the WebRequest URL.
    if (-not $proc.WaitForExit(20000)) {
      Say "  Waiting for $platform to close..."
      while (-not $proc.WaitForExit(5000)) {
        Show-Box "$platform is still open. Close it with File > Exit, wait a few seconds, then click OK." 'OK' 'Warning' | Out-Null
        $proc.WaitForExit(30000) | Out-Null
      }
    }
    if ($needHistory) {
      $ans = Show-Box "Did you choose 'All History' in the Account History tab?`n`n(No = show the steps again)" 'YesNoCancel' 'Question'
      if ($ans -eq 'Yes') { [IO.File]::WriteAllText($historyMark, (Get-Date).ToString('s')); $needHistory = $false }
      elseif ($ans -eq 'Cancel') { $needHistory = $false }
    }
    if ($needUrl -and -not (Test-WebRequestAllowed $base $hostName)) {
      # Newer MT5 builds store settings encrypted, so the file check cannot always see the URL.
      $ans = Show-Box "Could not confirm the website URL automatically (normal for newer $platform versions).`n`nDid you tick 'Allow WebRequest', add $baseUrl and close $platform with File > Exit?`n`nYes = continue`nNo = show the steps again" 'YesNo' 'Question'
      if ($ans -eq 'Yes') { [IO.File]::WriteAllText((Join-Path $base 'webrequest.ok'), (Get-Date).ToString('s')); break }
    }
  }

  $mqlDir = Join-Path $base $s.Mql
  $experts = Join-Path $mqlDir 'Experts'
  New-Item -ItemType Directory -Force -Path $experts, (Join-Path $mqlDir 'Presets') | Out-Null
  $src = Join-Path $experts "$($s.Ea).$($s.Ext)"
  Write-Utf8Bom $src (From-B64 $EaSource[$platform])
  $compiled = Join-Path $experts "$($s.Ea).$($s.Compiled)"
  Remove-Item -LiteralPath $compiled -Force -ErrorAction SilentlyContinue
  Say "  Compiling EA for $platform..."
  try {
    Start-Process -FilePath (Join-Path $base $s.Editor) -ArgumentList @("/portable", "/compile:`"$src`"", "/inc:`"$mqlDir`"", '/log') -WorkingDirectory $base -Wait -WindowStyle Hidden
  } catch {}
  if (-not (Test-Path $compiled)) { Say "  EA will be compiled by MT on first start." 'DarkYellow' }

  $profileCharts = @((Join-Path $base 'profiles\default'), (Join-Path $mqlDir 'Profiles\Charts\Default'))
  foreach ($p in $profileCharts) { Get-ChildItem -LiteralPath $p -Filter '*.chr' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue }
  return $base
}

function Get-SafeName($name) { return ($name -replace '[^A-Za-z0-9_.-]', '_') }

function Get-Norm($text) { return ("$text" -replace '[^A-Za-z0-9]', '').ToLower() }

function Select-Mt5ServerFile($acc) {
  $files = @(Get-ChildItem -LiteralPath $Mt5ServersDir -Filter '*.dat' -File -ErrorAction SilentlyContinue)
  if ($files.Count -eq 0) { return $null }
  $server = Get-Norm $acc.server
  $broker = Get-Norm $acc.broker
  # Files are named Broker.dat or Broker__Tag.dat (e.g. ICMarkets__Live.dat); prefer a tag found in the server name
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

function New-AccountTerminal($platform, $base, $acc, $cfg) {
  $s = $Spec[$platform]
  $dir = Join-Path $GroupDir (Get-SafeName $acc.account_name)
  robocopy $base $dir /E /NFL /NDL /NJH /NJS /NP /MT:8 | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Could not create terminal for $($acc.account_name)." }

  $preset = "AccountLabel=$($acc.account_name)`r`nSupabaseUrl=$($cfg.bridge.url)`r`nSupabaseKey=$($cfg.bridge.key)`r`nBridgeKey=$($acc.bridge_key)`r`n"
  $presetPath = Join-Path $dir "$($s.Mql)\Presets\copybridge.set"
  $iniPath = Join-Path $dir 'config\copybridge.ini'
  $server = "$($acc.server)".Trim()

  if ($platform -eq 'MT4') {
    $want = Get-Norm $server
    $learn = -not (Get-ChildItem -LiteralPath (Join-Path $dir 'config') -Filter '*.srv' -File -ErrorAction SilentlyContinue | Where-Object { (Get-Norm $_.BaseName) -eq $want })
    $shared = Get-ChildItem -LiteralPath $Mt4ServersDir -Filter '*__servers.ini' -File -ErrorAction SilentlyContinue | Where-Object { (Get-Norm (($_.BaseName -split '__', 2)[0])) -eq $want } | Select-Object -First 1
    if ($learn -and $shared) {
      Copy-Item -LiteralPath $shared.FullName -Destination (Join-Path $dir 'config\servers.ini') -Force
      $learn = $false
    }
    if ($learn) { Say "    No server file for $server yet: if MT cannot log in, pick the broker once by hand and the PC will save it to the library." 'DarkYellow' }
    Write-Ascii $presetPath $preset
    Write-Ascii $iniPath (@(
        "Login=$($acc.login)", "Password=$($acc.password)", "Server=$server",
        'AutoConfiguration=true', 'EnableNews=false',
        'ExpertsEnable=true', 'ExpertsDllImport=false', 'ExpertsExpImport=true', 'ExpertsTrades=true',
        "Symbol=$($acc.chart_symbol)", 'Period=H1', "Expert=$($s.Ea)", 'ExpertParameters=copybridge.set'
      ) -join "`r`n")
    $launchArgs = "/portable `"config\copybridge.ini`""
  } else {
    $serverFile = Select-Mt5ServerFile $acc
    $learn = -not $serverFile
    if ($serverFile) {
      Copy-Item -LiteralPath $serverFile.FullName -Destination (Join-Path $dir 'config\servers.dat') -Force
      Say "    server file: $($serverFile.Name)"
    } else {
      Say "    No MT5 server file matches broker '$($acc.broker)' / $($acc.server). If MT cannot log in, pick the broker once by hand and the PC will save it to the library." 'DarkYellow'
    }
    Write-Unicode $presetPath $preset
    Write-Unicode $iniPath (@(
        '[Common]', "Login=$($acc.login)", "Password=$($acc.password)", "Server=$server", 'KeepPrivate=1', 'NewsEnable=0',
        '[Charts]', 'MaxBars=5000',
        '[Experts]', 'AllowLiveTrading=1', 'AllowDllImport=0', 'Enabled=1', 'Account=0', 'Profile=0',
        '[StartUp]', "Expert=$($s.Ea)", "Symbol=$($acc.chart_symbol)", 'Period=H1', 'ExpertParameters=copybridge.set'
      ) -join "`r`n")
    $launchArgs = "/portable /config:`"$iniPath`""
  }
  return [ordered]@{ account_name = $acc.account_name; platform = $platform; type = $acc.type; dir = $dir; exe = $s.Exe; args = $launchArgs; server = $server; learn = [bool]$learn }
}

function New-Shortcut($path, $controlPath, $action, $icon, $hidden) {
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut($path)
  if ($hidden) {
    $lnk.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
    $lnk.Arguments = "//B //Nologo `"$(Join-Path $GroupDir 'run-hidden.vbs')`" $action"
  } else {
    $lnk.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$controlPath`" -Action $action"
  }
  $lnk.WorkingDirectory = $GroupDir
  if ($icon) { $lnk.IconLocation = "$icon,0" }
  if ($action -eq 'nextpage') { $lnk.Hotkey = 'CTRL+ALT+N' }
  $lnk.Save()
}

function Wait-Online($total) {
  Step "Waiting for accounts to come online (up to 3 minutes)..."
  $deadline = (Get-Date).AddMinutes(3)
  $online = @()
  $list = @()
  do {
    Start-Sleep -Seconds 6
    try {
      $list = @((Invoke-Api @{ action = 'status'; install_key = $Script:InstallKey }).accounts)
      $online = @($list | Where-Object { $_.online })
      Say "  $($online.Count) / $total online"
    } catch { Say "  (status check failed: $_)" 'DarkYellow' }
  } while ($online.Count -lt $total -and (Get-Date) -lt $deadline)
  return @($list | Where-Object { -not $_.online } | ForEach-Object { $_.account_name })
}

function Test-AccountOnline($name, $seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  do {
    Start-Sleep -Seconds 5
    try {
      $acc = @((Invoke-Api @{ action = 'status'; install_key = $Script:InstallKey }).accounts) | Where-Object { $_.account_name -eq $name } | Select-Object -First 1
      if ($acc -and $acc.online) { return $true }
    } catch {}
  } while ((Get-Date) -lt $deadline)
  return $false
}

# MT attaches the EA only while starting, so after a login by hand it must reopen with the EA, on the server it really connected to.
function Restart-WithEa($t, $acc) {
  $prefix = $t.dir.TrimEnd('\') + '\'
  $procs = @(Get-Process -Name terminal, terminal64 -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) })
  $title = "$(($procs | Select-Object -First 1).MainWindowTitle)"
  if ($title -match "^\s*$([regex]::Escape("$($acc.login)"))\s*[-:]\s*([^:\s]+)") {
    $live = $Matches[1]
    if ($live -ne $t.server) {
      Say "    $($t.account_name) is logged in on server $live (website says $($t.server)); using $live" 'DarkYellow'
      $iniPath = Join-Path $t.dir 'config\copybridge.ini'
      $text = [IO.File]::ReadAllText($iniPath) -replace '(?m)^Server=.*$', "Server=$live"
      if ($t.platform -eq 'MT5') { Write-Unicode $iniPath $text } else { Write-Ascii $iniPath $text }
      $t['server'] = $live
    }
  }
  Say "    Reopening $($t.account_name) with the EA on the $($acc.chart_symbol) chart..."
  foreach ($p in $procs) { try { $p.CloseMainWindow() | Out-Null } catch {} }
  Start-Sleep -Seconds 10
  foreach ($p in $procs) { try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {} }
  Start-Process -FilePath (Join-Path $t.dir $t.exe) -ArgumentList $t.args -WorkingDirectory $t.dir | Out-Null
}

# A fresh MT only knows the server NAME; until its access points are scanned once it never connects.
function Confirm-ServerScan($terminals, $accounts, $offline) {
  $still = @()
  foreach ($name in $offline) {
    $t = $terminals | Where-Object { $_.account_name -eq $name } | Select-Object -First 1
    $acc = $accounts | Where-Object { $_.account_name -eq $name } | Select-Object -First 1
    if (-not $t -or -not $acc) { $still += $name; continue }
    # A broker fixed by hand means any saved file for it is wrong, so the new one replaces it.
    $t['learn'] = $true; $t['replace'] = $true
    $online = $false
    while (-not $online) {
      Set-Clipboard -Value $t.server
      if ($t.platform -eq 'MT4') {
        $steps = "1. File > Open an Account`n" +
          "2. Click 'Scan' and wait until every server shows a Ping (ms)`n" +
          "3. Select $($t.server) (Ctrl+V to search) and click Next`n" +
          "4. Choose 'Existing trade account'"
      } else {
        $steps = "1. File > Open an Account`n" +
          "2. Type the broker name '$($acc.broker)' in the search box and press Enter (MT5 scans the servers)`n" +
          "3. Select the broker, then 'Connect with an existing trade account'`n" +
          "4. Server: $($t.server) (Ctrl+V)"
      }
      Show-Box ("$name is not connected to its broker yet.`n`nIn the MT window of $name :`n`n$steps`n`nClick OK here when you reach the Login / Password fields.") | Out-Null
      Set-Clipboard -Value "$($acc.password)"
      Show-Box ("Login: $($acc.login)`nPassword: press Ctrl+V (already copied)`n`nClick Finish in MT, then OK here. If the EA is not running yet, the PC reopens this MT with the EA on the chart, then checks the connection for up to 2 minutes.") | Out-Null
      Set-Clipboard -Value ' '
      Say "  Checking $name ..."
      $online = Test-AccountOnline $name 30
      if (-not $online) {
        Restart-WithEa $t $acc
        $online = Test-AccountOnline $name 90
      }
      if ($online) { Say "  $name online" 'Green'; break }
      $ans = Show-Box ("$name is still not online on the website.`n`nIn the MT window of $name check:`n" +
        "1. Bottom-right shows a connection (not 'No connection' / 'Invalid account')`n" +
        "2. Logged in to login $($acc.login) exactly (File > Login to Trade Account). The EA stays silent on any other login.`n" +
        "3. A $($acc.chart_symbol) chart shows the EA name top-right and 'Algo Trading' / 'AutoTrading' is green`n" +
        "4. Toolbox > Experts tab: a line 'LiveBridge: v3.0 initialized'`n`n" +
        "Retry = check again`nCancel = skip this account") 'RetryCancel' 'Warning'
      if ($ans -ne 'Retry') { break }
    }
    if (-not $online) { $still += $name }
  }
  return $still
}

function Set-PcForTrading {
  $backup = Read-PcBackup $Root
  $notes = @()
  try { Set-PowerForTrading $backup; $notes += 'High performance power plan, never sleep / hibernate' } catch { Say "  Could not change power settings: $_" 'DarkYellow' }
  try { Set-UpdatesForTrading $backup; $notes += 'Windows Update: download only when you choose, no automatic restart' } catch { Say "  Could not change Windows Update settings: $_" 'DarkYellow' }
  Save-PcBackup $Root $backup
  Write-Utf8Bom (Join-Path $Root 'pc_settings.ps1') (From-B64 $PcSettingsSource)
  foreach ($n in $notes) { Say "  + $n" }
  return $backup
}

function Read-Secret($prompt) {
  $form = New-Object System.Windows.Forms.Form
  $form.Text = $Title
  $form.Width = 460; $form.Height = 190
  $form.StartPosition = 'CenterScreen'; $form.TopMost = $true
  $form.FormBorderStyle = 'FixedDialog'; $form.MaximizeBox = $false; $form.MinimizeBox = $false
  $label = New-Object System.Windows.Forms.Label
  $label.Text = $prompt; $label.SetBounds(12, 12, 420, 48)
  $box = New-Object System.Windows.Forms.TextBox
  $box.UseSystemPasswordChar = $true; $box.SetBounds(12, 66, 420, 24)
  $ok = New-Object System.Windows.Forms.Button
  $ok.Text = 'OK'; $ok.DialogResult = 'OK'; $ok.SetBounds(276, 104, 75, 28)
  $cancel = New-Object System.Windows.Forms.Button
  $cancel.Text = 'Skip'; $cancel.DialogResult = 'Cancel'; $cancel.SetBounds(357, 104, 75, 28)
  $form.Controls.AddRange(@($label, $box, $ok, $cancel))
  $form.AcceptButton = $ok; $form.CancelButton = $cancel
  if ($form.ShowDialog() -ne 'OK') { return $null }
  return $box.Text
}

function Test-WindowsPassword($user, $domain, $password) {
  try {
    Add-Type -AssemblyName System.DirectoryServices.AccountManagement
    $kind = 'Domain'
    if ($domain -ieq $env:COMPUTERNAME) { $kind = 'Machine' }
    $ctx = New-Object System.DirectoryServices.AccountManagement.PrincipalContext($kind, $domain)
    return $ctx.ValidateCredentials($user, $password)
  } catch { return $false }
}

function Request-AutoLogon($backup) {
  if (Test-AutoLogonOn) { Say '  + Automatic sign-in is already on'; return $true }
  $who = "$((Get-CimInstance Win32_ComputerSystem).UserName)"
  if (-not $who) { $who = "$env:USERDOMAIN\$env:USERNAME" }
  $domain, $user = $who.Split('\', 2)
  $ans = Show-Box ("After a power cut or a Windows restart, MT can only reopen once someone signs in to Windows.`n`n" +
    "Turn on AUTOMATIC SIGN-IN for '$who'? (recommended for trading PCs / VPS)`n`n" +
    "Note: the Windows password is saved on this PC so it can sign in by itself. Only do this on a PC that is kept safe.") 'YesNo' 'Question'
  if ($ans -ne 'Yes') { return $false }
  while ($true) {
    $pw = Read-Secret "Windows password for $who"
    if ($null -eq $pw) { return $false }
    if (Test-WindowsPassword $user $domain $pw) { break }
    $retry = Show-Box "That password could not be confirmed. Try again?`n(No = save it anyway, e.g. for a Microsoft account)" 'YesNoCancel' 'Warning'
    if ($retry -eq 'No') { break }
    if ($retry -eq 'Cancel') { return $false }
  }
  Enable-AutoLogon $backup $user $domain $pw
  Save-PcBackup $Root $backup
  Say "  + Automatic sign-in on for $who"
  return $true
}

function Register-GroupTask($controlPath) {
  $vbs = Join-Path $GroupDir 'watchdog.vbs'
  $psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $cmd = "`"$psExe`" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$controlPath`" -Action watchdog"
  Write-Ascii $vbs ("CreateObject(""WScript.Shell"").Run """ + $cmd.Replace('"', '""') + """, 0, False`r`n")
  $name = "CopyTerminals - $GroupSlug"
  Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
  $users = (New-Object Security.Principal.SecurityIdentifier 'S-1-5-32-545').Translate([Security.Principal.NTAccount]).Value
  $action = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\wscript.exe') -Argument "//B //Nologo `"$vbs`""
  $principal = New-ScheduledTaskPrincipal -GroupId $users -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
  $atLogon = New-ScheduledTaskTrigger -AtLogOn
  $atLogon.Delay = 'PT20S'
  $every = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(3) -RepetitionInterval (New-TimeSpan -Minutes 2) -RepetitionDuration (New-TimeSpan -Days 3650)
  Register-ScheduledTask -TaskName $name -Action $action -Principal $principal -Settings $settings -Trigger @($atLogon, $every) -Description "Reopens the MT terminals of $GroupLabel after a restart or crash." | Out-Null
  return $name
}

function Install-Main {
  Say "Copy Terminals Installer - $GroupLabel" 'White'
  Say '  Package: __BUILD__' 'DarkGray'

  Step 'Connecting to website...'
  $machineId = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Cryptography').MachineGuid
  $cfg = Invoke-Api @{ action = 'claim'; token = $InstallCode; machine_id = $machineId; machine_name = $env:COMPUTERNAME }
  $Script:InstallKey = $cfg.install_key
  if ($cfg.latest_build -and $cfg.latest_build -ne '__BUILD_CODE__') {
    Say "  WARNING: this file is an OLD version (build __BUILD_CODE__). Newest is build $($cfg.latest_build)." 'Yellow'
    $ans = Show-Box ("This install file is an OLD version.`n`nThis file: build __BUILD_CODE__`nNewest on the website: build $($cfg.latest_build)`n`n" +
      "Download a new file from the website (Copy Groups > PC install package) so the PC gets the latest EA and fixes.`n`n" +
      "OK = stop now (recommended)`nCancel = continue with the old version anyway") 'OKCancel' 'Warning'
    if ($ans -eq 'OK') { throw "Old installer file (build __BUILD_CODE__, newest $($cfg.latest_build)). Download a new one from the website." }
  }
  $accounts = @($cfg.accounts)
  Say "  Group: $($cfg.group.name)  ($($accounts.Count) accounts)"

  $manifestPath = Join-Path $GroupDir 'manifest.json'
  if (Test-Path $manifestPath) {
    $ans = Show-Box "This group is already installed on this PC. Reinstall it?`n(Its terminals will be closed and set up again.)" 'YesNo' 'Question'
    if ($ans -ne 'Yes') { Send-Report 'failed' 'Cancelled: already installed on this PC.'; return }
    try {
      $old = [IO.File]::ReadAllText($manifestPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
      foreach ($task in @($old.tasks)) { if ($task) { Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue } }
      foreach ($sc in $old.shortcuts) { Remove-Item -LiteralPath $sc -Force -ErrorAction SilentlyContinue }
    } catch {}
    Stop-GroupTerminals
    Remove-Item -LiteralPath $GroupDir -Recurse -Force
  }

  Step 'Checking this PC capacity...'
  $hw = Get-Hardware
  $cap = Get-Capacity $hw $accounts
  Say "  CPU: $($hw.cpu) ($($hw.cores) threads)"
  Say "  RAM: $($hw.ram_gb) GB   Free disk: $($hw.free_disk_gb) GB ($($hw.disk_type))   Screen: $($hw.screen)"
  Say "  Limits - RAM: $($cap.by_ram)  CPU: $($cap.by_cpu)  Disk: $($cap.by_disk)  => max $($cap.total) terminals"
  if ($hw.other_terminals -gt 0) { Say "  Other MT terminals already running: $($hw.other_terminals)" }
  Say "  This package needs $($cap.needed) (MT4: $($cap.mt4), MT5: $($cap.mt5)). Available: $($cap.available)"
  $hwReport = @{}
  foreach ($k in $hw.Keys) { $hwReport[$k] = $hw[$k] }
  $hwReport['limits'] = @{ ram = $cap.by_ram; cpu = $cap.by_cpu; disk = $cap.by_disk; limit = $cap.limit }

  if ($cap.mt5 -gt 0 -and -not $hw.os64) {
    Send-Report 'blocked' 'MT5 needs 64-bit Windows.' @{ capacity = $cap.available; hardware = $hwReport }
    Show-Box "MT5 needs 64-bit Windows. Installation stopped." 'OK' 'Error' | Out-Null
    return
  }
  if ($cap.needed -gt $cap.available) {
    $msg = "This PC can safely run at most $($cap.available) MT terminals (limited by $($cap.limit)), but this package has $($cap.needed)."
    Send-Report 'blocked' $msg @{ capacity = $cap.available; hardware = $hwReport }
    Show-Box ("INSTALLATION STOPPED`n`n" +
      "This PC can safely run at most: $($cap.available) MT terminals`n`n" +
      "This package has: $($cap.needed) (MT4 $($cap.mt4) / MT5 $($cap.mt5))`n`n" +
      "Limited by $($cap.limit). RAM $($hw.ram_gb) GB, $($hw.cores) CPU threads, $($hw.free_disk_gb) GB free disk.`n`n" +
      "Go back to the website, untick some accounts and download a new package.") 'OK' 'Error' | Out-Null
    return
  }
  $displayMax = [math]::Floor([int]$hw.screen.Split('x')[0] / 360) * [math]::Floor([int]$hw.screen.Split('x')[1] / 260)
  if ($cap.needed -gt $displayMax) {
    Say "  Note: $($cap.needed) windows on a $($hw.screen) screen will be small." 'DarkYellow'
  }
  Send-Report 'installing' "Capacity OK: $($cap.needed) of $($cap.available)." @{ capacity = $cap.available; hardware = $hwReport }

  New-Item -ItemType Directory -Force -Path $GroupDir | Out-Null
  & icacls $Root /grant '*S-1-5-32-545:(OI)(CI)M' /T /Q | Out-Null

  Step 'Setting this PC for 24/7 trading...'
  $pcBackup = Set-PcForTrading
  $autoLogon = Request-AutoLogon $pcBackup

  $terminals = @()
  foreach ($platform in @('MT4', 'MT5')) {
    $group = @($accounts | Where-Object { $_.platform -eq $platform })
    if ($group.Count -eq 0) { continue }
    Step "Setting up $platform ($($group.Count) accounts)..."
    $base = Initialize-Base $platform $cfg
    foreach ($acc in $group) {
      Say "  + $($acc.account_name)  [$($acc.type)]  $($acc.server)  chart $($acc.chart_symbol)"
      $terminals += New-AccountTerminal $platform $base $acc $cfg
    }
  }
  $order = @{}
  for ($i = 0; $i -lt $accounts.Count; $i++) { $order[$accounts[$i].account_name] = $i }
  $terminals = @($terminals | Sort-Object { $order[$_.account_name] })

  Step 'Creating shortcuts and auto-start...'
  $controlPath = Join-Path $GroupDir 'control.ps1'
  Write-Utf8Bom $controlPath (From-B64 $ControlSource)
  Write-Ascii (Join-Path $GroupDir 'run-hidden.vbs') $RunHiddenVbs
  # WScript.Shell cannot save shortcuts whose names contain characters outside the system code page.
  $label = (($GroupLabel -replace '[^\x20-\x7E]', '') -replace '[\\/:*?"<>|]', '_').Trim()
  if (-not $label) { $label = 'Copy Terminals' }
  $desktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
  $icon = Join-Path $terminals[0].dir $terminals[0].exe
  $startLnk = Join-Path $desktop "$label - Start all.lnk"
  $shortcuts = @(
    $startLnk,
    (Join-Path $desktop "$label - Stop all.lnk"),
    (Join-Path $desktop "$label - Arrange windows.lnk"),
    (Join-Path $desktop "$label - Uninstall.lnk"),
    (Join-Path $desktop "$label - Next page.lnk")
  )
  New-Shortcut $shortcuts[0] $controlPath 'start' $icon $true
  New-Shortcut $shortcuts[1] $controlPath 'stop' $null $true
  New-Shortcut $shortcuts[2] $controlPath 'arrange' $null $true
  New-Shortcut $shortcuts[3] $controlPath 'uninstall' $null $false
  New-Shortcut $shortcuts[4] $controlPath 'nextpage' $null $true
  $tasks = @()
  try { $tasks += Register-GroupTask $controlPath; Say '  + MT reopens after restart / crash (checked every 2 minutes)' }
  catch {
    Say "  Could not create the auto-restart task: $_" 'DarkYellow'
    $fallback = Join-Path ([Environment]::GetFolderPath('CommonStartup')) "$label - Copy Terminals.lnk"
    New-Shortcut $fallback $controlPath 'start' $icon $true
    $shortcuts += $fallback
  }

  $manifest = [ordered]@{
    group_label = $GroupLabel
    group_master = $cfg.group.master
    function_url = $FunctionUrl
    anon_key = $AnonKey
    install_key = $Script:InstallKey
    installed_at = (Get-Date).ToString('s')
    ea_code = Get-ShortCode ((From-B64 $EaSource.MT4) + [char]0 + (From-B64 $EaSource.MT5))
    control_code = Get-ShortCode (From-B64 $ControlSource)
    terminals = $terminals
    shortcuts = $shortcuts
    launcher = 'vbs2'
    tasks = $tasks
  }
  Write-Utf8Bom $manifestPath ($manifest | ConvertTo-Json -Depth 6)

  Step "Starting $($terminals.Count) terminals..."
  Start-Process -FilePath 'explorer.exe' -ArgumentList "`"$startLnk`""

  $pcNote = "`n`nThis PC: never sleeps, high performance, no automatic Windows restart. MT reopens by itself after a restart or crash." +
    "`n`nTip: in the PC's BIOS, set 'Restore on AC power loss' = Power On so it turns on by itself after a power cut."
  if (-not $autoLogon) { $pcNote += "`n`nAutomatic sign-in is OFF: after a restart, sign in to Windows and MT will reopen." }

  $offline = @(Wait-Online $terminals.Count)
  if ($offline.Count -gt 0) {
    Step "Scanning broker servers for $($offline.Count) account(s) that are not connected..."
    $offline = @(Confirm-ServerScan $terminals $accounts $offline)
    Write-Utf8Bom $manifestPath ($manifest | ConvertTo-Json -Depth 6)
  }
  if (@($terminals | Where-Object { $_.learn }).Count -gt 0) {
    Step "Saving broker server files to the website (so the next PC connects by itself)..."
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $controlPath -Action watchdog
    Say '  Waiting for MT to reopen and log in again...'
    Start-Sleep -Seconds 120
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $controlPath -Action watchdog
    Say '  Any file not saved yet keeps being retried every few minutes while this PC runs.' 'DarkGray'
  }
  if ($offline.Count -eq 0) {
    Send-Report 'installed' "All $($terminals.Count) accounts online." @{ capacity = $cap.available; hardware = $hwReport }
    Say ''
    Say "DONE. All $($terminals.Count) accounts are online." 'Green'
    Show-Box ("Done! All $($terminals.Count) accounts are online.`n`nDesktop shortcuts: Start all / Stop all / Arrange windows / Uninstall." + $pcNote) | Out-Null
  } else {
    $msg = "Installed. Not online yet: " + ($offline -join ', ')
    Send-Report 'installed' $msg @{ capacity = $cap.available; hardware = $hwReport }
    Say ''
    Say $msg 'Yellow'
    $fixLines = @(foreach ($name in $offline) {
        $t = $terminals | Where-Object { $_.account_name -eq $name } | Select-Object -First 1
        $acc = $accounts | Where-Object { $_.account_name -eq $name } | Select-Object -First 1
        if ($t -and $t.platform -eq 'MT5') {
          "$name (MT5): File > Open an Account > type '$($acc.broker)' in the search box + Enter > select the broker > Connect with an existing trade account > server $($t.server)"
        } else {
          "$name (MT4): File > Open an Account > Scan > select $($t.server) > Existing trade account"
        }
      })
    Show-Box ("Installed, but these accounts are not online yet:`n`n" + ($fixLines -join "`n`n") +
      "`n`nLog in ONCE with the steps above. MT remembers it after every restart, and the PC saves the server file to the website so the next install connects by itself." +
      "`n`nAlso check: password, the AutoTrading button and the Experts tab." + $pcNote) 'OK' 'Warning' | Out-Null
  }
}

if (-not (Test-Admin)) {
  $self = $env:CT_INSTALLER
  $cmd = "`$env:CT_INSTALLER = '" + $self.Replace("'", "''") + "'; `$t = [IO.File]::ReadAllText(`$env:CT_INSTALLER, [Text.Encoding]::UTF8); iex `$t.Substring(`$t.IndexOf('#PS' + 'START'))"
  $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cmd))
  try {
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $enc)
  } catch {
    Show-Box "Administrator permission is needed to install." 'OK' 'Error' | Out-Null
  }
  return
}

try {
  Install-Main
} catch {
  $err = "$_"
  Say ''
  Say "FAILED: $err" 'Red'
  Send-Report 'failed' $err
  Show-Box "Installation failed.`n`n$err" 'OK' 'Error' | Out-Null
}
Say ''
Read-Host 'Press Enter to close'
