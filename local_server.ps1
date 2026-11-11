# 4NIK8 Industrial Command - loopback-only static web server.
# No administrator privileges, Python, Node.js, or internet access required to host the UI.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 48148
$prefix = "http://127.0.0.1:$port/"
$types = @{'/'='text/html; charset=utf-8'; '/index.html'='text/html; charset=utf-8'; '/app.js'='text/javascript; charset=utf-8'; '/logic.js'='text/javascript; charset=utf-8'; '/styles.css'='text/css; charset=utf-8'}
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
try { $listener.Start() }
catch {
    Write-Host "Could not start 4NIK8 on port $port. Another copy may already be running." -ForegroundColor Yellow
    Write-Host "If already running, open $prefix in your browser."
    exit 1
}
Write-Host "4NIK8 Industrial Command - local service on $prefix" -ForegroundColor Cyan
Write-Host 'Keep this window running while using the dashboard. Press Ctrl+C to stop.'
Start-Process $prefix
try {
 while ($true) {
    $client = $listener.AcceptTcpClient()
    $reader = $null
    try {
        $client.ReceiveTimeout = 5000
        $stream = $client.GetStream()
        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
        $firstLine = $reader.ReadLine()
        if ([string]::IsNullOrWhiteSpace($firstLine)) { continue }
        # Drain request headers; we accept only loopback GET and HEAD requests.
        do { $line = $reader.ReadLine() } while ($null -ne $line -and $line -ne '')
        $segments = $firstLine -split ' '
        if ($segments.Length -lt 2) { continue }
        $method = $segments[0]
        $path = ($segments[1] -split '\?')[0]
        if ($method -ne 'GET' -and $method -ne 'HEAD') {
            $data = [System.Text.Encoding]::UTF8.GetBytes('Method not allowed')
            $header = "HTTP/1.1 405 Method Not Allowed`r`nContent-Length: $($data.Length)`r`nConnection: close`r`n`r`n"
        }
        elseif (-not $types.ContainsKey($path)) {
            $data = [System.Text.Encoding]::UTF8.GetBytes('Not found')
            $header = "HTTP/1.1 404 Not Found`r`nContent-Length: $($data.Length)`r`nConnection: close`r`n`r`n"
        }
        else {
            $file = if ($path -eq '/') { 'index.html' } else { $path.Substring(1) }
            $data = [System.IO.File]::ReadAllBytes((Join-Path $root $file))
            $header = "HTTP/1.1 200 OK`r`nContent-Type: $($types[$path])`r`nContent-Length: $($data.Length)`r`nX-Content-Type-Options: nosniff`r`nReferrer-Policy: strict-origin-when-cross-origin`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
        }
        $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
        $stream.Write($headerBytes, 0, $headerBytes.Length)
        if ($method -ne 'HEAD') { $stream.Write($data, 0, $data.Length) }
        $stream.Flush()
    }
    catch { Write-Host "Request error: $_" -ForegroundColor Yellow }
    finally { if ($reader) { $reader.Dispose() }; $client.Dispose() }
 }
}
finally { $listener.Stop() }