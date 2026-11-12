# 4NIK8 ORE Industrial Command - local-only Windows web host.
# Source files may be replaced during updates; user preferences live in Windows AppData.
# Windows PowerShell 5.1+; no administrator privileges or third-party runtime required.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 48148
$prefix = "http://127.0.0.1:$port/"
$dataRoot = Join-Path $env:LOCALAPPDATA '4NIK8 ORE\Industrial Command'
$settingsFile = Join-Path $dataRoot 'settings.json'
$backupFile = Join-Path $dataRoot 'settings.json.bak'
$types = @{
  '/'='text/html; charset=utf-8'; '/index.html'='text/html; charset=utf-8';
  '/app.js'='text/javascript; charset=utf-8'; '/logic.js'='text/javascript; charset=utf-8';
  '/styles.css'='text/css; charset=utf-8'; '/assets/4nik8-banner.webp'='image/webp'; '/assets/4nik8-corp-emblem.png'='image/png'
}
$utf8 = [System.Text.UTF8Encoding]::new($false)
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
try { $listener.Start() }
catch {
    Write-Host "Could not start 4NIK8 on port $port. Another copy may already be running." -ForegroundColor Yellow
    Write-Host "If already running, open $prefix in your browser."
    Write-Host 'IMPORTANT: close the previous server window before running an updated version.'
    exit 1
}
Write-Host "4NIK8 Industrial Command v0.4.6 - $prefix" -ForegroundColor Cyan
Write-Host "Saved channels and preferences: $settingsFile"
Write-Host 'Keep this window running. Ctrl+C closes the application server.'
Start-Process $prefix
try {
 while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
   $client.ReceiveTimeout = 7000
   $client.SendTimeout = 7000
   $stream = $client.GetStream()
   # Read headers as bytes. StreamReader may buffer body bytes, so do not mix readers.
   $headerBytes = New-Object 'System.Collections.Generic.List[byte]'
   $previous = @(0,0,0,0)
   while ($headerBytes.Count -lt 16384) {
      $byte = $stream.ReadByte()
      if ($byte -lt 0) { break }
      $headerBytes.Add([byte]$byte)
      $previous = @($previous[1],$previous[2],$previous[3],$byte)
      if ($previous[0] -eq 13 -and $previous[1] -eq 10 -and $previous[2] -eq 13 -and $previous[3] -eq 10) { break }
   }
   if ($headerBytes.Count -ge 16384) { throw 'Request headers too large' }
   $headerText = [System.Text.Encoding]::ASCII.GetString($headerBytes.ToArray())
   $lines = $headerText -split "`r`n"
   $requestParts = $lines[0] -split ' '
   if ($requestParts.Count -lt 2) { continue }
   $method = $requestParts[0]
   $path = ($requestParts[1] -split '\?')[0]
   $headers = @{}
   foreach ($line in $lines[1..($lines.Count-1)]) {
      if ($line -match '^([^:]+):\s*(.*)$') { $headers[$matches[1].ToLowerInvariant()] = $matches[2] }
   }
   $status = '200 OK'
   $mime = 'application/json; charset=utf-8'
   $data = [byte[]]@()
   if ($path -eq '/api/settings' -and $method -eq 'GET') {
      if (Test-Path -LiteralPath $settingsFile) { $data = [System.IO.File]::ReadAllBytes($settingsFile) }
      else { $data = $utf8.GetBytes('null') }
   }
   elseif ($path -eq '/api/settings' -and $method -eq 'PUT') {
      $origin = $headers['origin']
      $type = $headers['content-type']
      $length = 0
      $validLength = [int]::TryParse([string]$headers['content-length'],[ref]$length)
      if (($origin -and $origin -ne "http://127.0.0.1:$port") -or
          -not ([string]$type).StartsWith('application/json') -or
          -not $validLength -or $length -lt 2 -or $length -gt 131072) {
         $status = '400 Bad Request'; $data = $utf8.GetBytes('{"error":"Invalid settings request"}')
      }
      else {
         $bytes = New-Object byte[] $length
         $offset = 0
         while ($offset -lt $length) {
            $read = $stream.Read($bytes,$offset,$length-$offset)
            if ($read -le 0) { break }
            $offset += $read
         }
         if ($offset -ne $length) {
            $status = '400 Bad Request'; $data = $utf8.GetBytes('{"error":"Incomplete settings body"}')
         }
         else {
            try {
               $doc = $utf8.GetString($bytes) | ConvertFrom-Json
               if ($doc.schemaVersion -ne 1 -or $null -eq $doc.radio -or $null -eq $doc.scanner) { throw 'Unsupported settings schema' }
               $allowed = @('neon','steel','amber','oxide')
               if ($allowed -notcontains [string]$doc.livery) { throw 'Unrecognized livery' }
               $volume = [int]$doc.radio.volume
               if ($volume -lt 0 -or $volume -gt 100) { throw 'Invalid volume' }
               $shuffle = $false
               if ($null -ne $doc.radio.shuffle) {
                  if ($doc.radio.shuffle -isnot [bool]) { throw 'Invalid shuffle option' }
                  $shuffle = [bool]$doc.radio.shuffle
               }
               $channels = @($doc.radio.channels)
               if ($channels.Count -gt 40) { throw 'Too many channels' }
               $cleanChannels = @()
               foreach ($c in $channels) {
                  $id = [string]$c.id
                  $name = [string]$c.name
                  $list = [string]$c.playlistId
                  if ($id.Length -lt 1 -or $id.Length -gt 90 -or $name.Length -lt 1 -or $name.Length -gt 48 -or
                      $list -cnotmatch '^[a-zA-Z0-9_-]{10,150}$') { throw 'Invalid radio channel' }
                  # Retain the user's actual shared link, including any Google-provided
                  # query token. Validate it is HTTPS on an approved YouTube host.
                  $savedUrl = [string]$c.url
                  $uri = $null
                  $safe = $savedUrl.Length -le 2048 -and
                     [System.Uri]::TryCreate($savedUrl,[System.UriKind]::Absolute,[ref]$uri) -and
                     $uri.Scheme -eq 'https' -and
                     (@('music.youtube.com','youtube.com','www.youtube.com','m.youtube.com','youtu.be') -contains $uri.Host.ToLowerInvariant()) -and
                     $uri.Query -match '(?:^\?|&)list=([^&]+)' -and
                     [System.Uri]::UnescapeDataString($Matches[1]) -ceq $list
                  if (-not $safe) { $savedUrl = 'https://music.youtube.com/playlist?list='+$list }
                  $cleanChannels += [ordered]@{id=$id;name=$name;playlistId=$list;url=$savedUrl}
               }
               $resource = [string]$doc.scanner.resource
               if (@('ore','ice','both') -notcontains $resource) { throw 'Invalid resource' }
               $hub = [string]$doc.scanner.hub
               if ($hub -ne 'all' -and $hub -ne 'local' -and $hub -notmatch '^\d{8}$') { throw 'Invalid hub' }
               $sys = [string]$doc.scanner.system
               if ($sys.Length -gt 100) { throw 'Invalid system' }
               $cargo = [int]$doc.scanner.cargo
               if ($cargo -lt 1 -or $cargo -gt 10000000) { throw 'Invalid cargo volume' }
               $selection = [string]$doc.radio.selectedChannelId
               if ($selection.Length -gt 90) { $selection = '' }
               # Extra freight fields are optional for backwards-compatible v0.3/v0.4 settings.
               $haul = [ordered]@{capacity=31625;taxPct=7.5;cashPerJump=0;minutesPerJump=2;pilotISKHour=0;preference='Safer'}
               if ($null -ne $doc.haul) {
                  foreach ($name in @('capacity','taxPct','cashPerJump','minutesPerJump','pilotISKHour')) {
                     if ($null -ne $doc.haul.$name) {
                        $n = 0.0
                        if (-not [double]::TryParse([string]$doc.haul.$name,[ref]$n)) { throw 'Invalid haul cost' }
                        $limit = switch ($name) { 'capacity' {10000000} 'taxPct' {100} 'cashPerJump' {100000000} 'minutesPerJump' {120} 'pilotISKHour' {1000000000} }
                        $min = if ($name -eq 'capacity') {1} elseif ($name -eq 'minutesPerJump') {0.1} else {0}
                        if ($n -lt $min -or $n -gt $limit) { throw 'Haul cost out of range' }
                        $haul[$name] = $n
                     }
                  }
                  if (@('Safer','Shorter','LessSecure') -contains [string]$doc.haul.preference) {$haul.preference=[string]$doc.haul.preference}
               }
               # Optional v0.4.3 mining profile; older settings files are accepted.
               # Blank cycle/yield fields remain null, so the app never fabricates production.
               $mining = [ordered]@{
                   profileName='High on Supply / Retriever';oreYield=$null;oreCycle=$null;oreModules=2;
                   iceUnits=$null;iceCycle=$null;iceModules=2;uptimePct=100;handlingMinutes=0;
                   returnHome=$true;observedOreM3Hour=$null;observedIceM3Hour=$null;
                   sort='value';session=$null
               }
               if ($null -ne $doc.mining) {
                   $pName = [string]$doc.mining.profileName
                   if ($pName.Length -ge 1 -and $pName.Length -le 56) { $mining.profileName=$pName }
                   foreach ($property in @('oreYield','oreCycle','oreModules','iceUnits','iceCycle','iceModules','uptimePct','handlingMinutes','observedOreM3Hour','observedIceM3Hour')) {
                       $v = $doc.mining.$property
                       if ($null -eq $v -or [string]$v -eq '') { continue }
                       $n = 0.0
                       $culture = [System.Globalization.CultureInfo]::InvariantCulture
                       $style = [System.Globalization.NumberStyles]::Float
                       if (-not [double]::TryParse([string]$v,$style,$culture,[ref]$n)) { throw 'Invalid mining value' }
                       $limit = switch ($property) { 'oreYield' {1000000} 'oreCycle' {10000} 'oreModules' {16} 'iceUnits' {1000} 'iceCycle' {10000} 'iceModules' {16} 'uptimePct' {100} 'handlingMinutes' {10000} 'observedOreM3Hour' {1000000000} 'observedIceM3Hour' {1000000000} }
                       $min = switch ($property) { 'oreCycle' {0.1} 'iceCycle' {0.1} 'oreModules' {1} 'iceModules' {1} 'uptimePct' {1} 'observedOreM3Hour' {0.01} 'observedIceM3Hour' {0.01} default {0} }
                       if ($n -lt $min -or $n -gt $limit) { throw 'Mining setting out of range' }
                       if ($property -in @('oreModules','iceModules') -and $n -ne [Math]::Floor($n)) { throw 'Mining module count must be an integer' }
                       $mining[$property] = $n
                   }
                   if ($null -ne $doc.mining.returnHome) {
                       if ($doc.mining.returnHome -isnot [bool]) { throw 'Invalid return-to-origin flag' }
                       $mining.returnHome=[bool]$doc.mining.returnHome
                   }
                   if (@('value','hour') -contains [string]$doc.mining.sort) { $mining.sort=[string]$doc.mining.sort }
                   if ($null -ne $doc.mining.session) {
                       $kind = [string]$doc.mining.session.kind
                       $st = 0.0
                       if (@('ore','ice') -contains $kind -and
                           [double]::TryParse([string]$doc.mining.session.startedAt,[System.Globalization.NumberStyles]::Float,[System.Globalization.CultureInfo]::InvariantCulture,[ref]$st) -and
                           $st -gt 0 -and $st -lt 9000000000000) {
                           $mining.session=[ordered]@{startedAt=$st;kind=$kind}
                       }
                   }
               }
               # Optional v0.4.6 freight exchange. No trade credentials or wallet keys.
               $trade = [ordered]@{budget=25000000;handling=10;items='Tritanium, Pyerite, Mexallon, Isogen, Nocxium, Zydrine, Megacyte, Morphite, Heavy Water, Liquid Ozone, Robotics, Coolant';sort='hour';returnHome=$false}
               if ($null -ne $doc.trade) {
                  foreach ($field in @('budget','handling')) {
                     if ($null -ne $doc.trade.$field) {
                        $v = 0.0
                        if (-not [double]::TryParse([string]$doc.trade.$field,[System.Globalization.NumberStyles]::Float,[System.Globalization.CultureInfo]::InvariantCulture,[ref]$v)) { throw 'Invalid trade amount' }
                        if ($v -lt $(if ($field -eq 'budget') {1} else {0.1}) -or $v -gt $(if ($field -eq 'budget') {1000000000000} else {10000})) { throw 'Trade amount out of range' }
                        $trade[$field]=$v
                     }
                  }
                  $items=[string]$doc.trade.items
                  if ($items.Length -gt 1800) { throw 'Trade watchlist too long' }
                  if ($items.Trim().Length -gt 0) { $trade.items=$items }
                  if (@('hour','net','roi') -contains [string]$doc.trade.sort) { $trade.sort=[string]$doc.trade.sort }
                  if ($null -ne $doc.trade.returnHome) {
                     if ($doc.trade.returnHome -isnot [bool]) { throw 'Invalid trade return flag' }
                     $trade.returnHome=[bool]$doc.trade.returnHome
                  }
               }
               $clean = [ordered]@{
                  schemaVersion=1; livery=[string]$doc.livery;
                  radio=[ordered]@{volume=$volume;shuffle=$shuffle;channels=$cleanChannels;selectedChannelId=$selection};
                  scanner=[ordered]@{system=$sys;hub=$hub;resource=$resource;cargo=$cargo};haul=$haul;mining=$mining;trade=$trade
               }
               $json = ConvertTo-Json -InputObject $clean -Depth 8 -Compress
               if (-not (Test-Path -LiteralPath $dataRoot)) { [System.IO.Directory]::CreateDirectory($dataRoot) | Out-Null }
               $temp = Join-Path $dataRoot ('.settings-'+[guid]::NewGuid().ToString('N')+'.tmp')
               [System.IO.File]::WriteAllBytes($temp, $utf8.GetBytes($json))
               if (Test-Path -LiteralPath $settingsFile) {
                  try { [System.IO.File]::Replace($temp,$settingsFile,$backupFile) }
                  catch {
                     Copy-Item -LiteralPath $settingsFile -Destination $backupFile -Force
                     Move-Item -LiteralPath $temp -Destination $settingsFile -Force
                  }
               }
               else { Move-Item -LiteralPath $temp -Destination $settingsFile }
               $data = $utf8.GetBytes('{"ok":true}')
            }
            catch {
               $status = '400 Bad Request'
               $data = $utf8.GetBytes('{"error":"Settings were not saved. Check values or storage permissions."}')
               Write-Host "Settings save rejected: $_" -ForegroundColor Yellow
            }
         }
      }
   }
   elseif ($types.ContainsKey($path) -and ($method -eq 'GET' -or $method -eq 'HEAD')) {
      $file = if ($path -eq '/') { 'index.html' } else { $path.Substring(1) }
      $data = [System.IO.File]::ReadAllBytes((Join-Path $root $file))
      $mime = $types[$path]
   }
   elseif ($path -eq '/api/settings') {
      $status = '405 Method Not Allowed'; $data = $utf8.GetBytes('{"error":"Method not allowed"}')
   }
   else {
      $status = '404 Not Found'; $data = $utf8.GetBytes('{"error":"Not found"}')
   }
   $header = "HTTP/1.1 $status`r`nContent-Type: $mime`r`nContent-Length: $($data.Length)`r`nX-Content-Type-Options: nosniff`r`nReferrer-Policy: strict-origin-when-cross-origin`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
   $out = [System.Text.Encoding]::ASCII.GetBytes($header)
   $stream.Write($out,0,$out.Length)
   if ($method -ne 'HEAD' -and $data.Length -gt 0) { $stream.Write($data,0,$data.Length) }
   $stream.Flush()
  }
  catch { Write-Host "HTTP request error: $_" -ForegroundColor Yellow }
  finally { $client.Dispose() }
 }
}
finally { $listener.Stop() }