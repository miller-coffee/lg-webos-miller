param(
    [ValidateSet('Enable', 'Disable', 'Status')]
    [string]$Action = 'Status'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$devicePath = Join-Path $projectRoot 'tv/device.json'
if (-not (Test-Path -LiteralPath $devicePath)) { throw 'Copy tv/device.example.json to tv/device.json and configure your TV locally.' }
$device = Get-Content -LiteralPath $devicePath -Raw | ConvertFrom-Json
$target = $device.user + '@' + $device.host
$stateFile = Join-Path $projectRoot '.local/tv-debug-tunnel.pid'
$ownerKey = Join-Path $projectRoot '.local/tv_owner_ed25519'
$knownHosts = Join-Path $projectRoot '.local/known_hosts'
$endpoint = 'http://127.0.0.1:19998'

function Get-TunnelProcess {
    if (-not (Test-Path -LiteralPath $stateFile)) { return $null }
    $tunnelId = 0
    if (-not [int]::TryParse((Get-Content -LiteralPath $stateFile -Raw).Trim(), [ref]$tunnelId)) { return $null }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$tunnelId" -ErrorAction SilentlyContinue
    if ($process -and $process.Name -ieq 'ssh.exe' -and
        $process.CommandLine.Contains($ownerKey) -and
        $process.CommandLine -match '127\.0\.0\.1:19998:127\.0\.0\.1:9998') { return $process }
    return $null
}
function Test-DebugEndpoint {
    try { $null = Invoke-RestMethod -Uri "$endpoint/json" -TimeoutSec 2; return $true }
    catch { return $false }
}
if ($Action -eq 'Disable') {
    $tunnel = Get-TunnelProcess
    if ($tunnel) { Stop-Process -Id $tunnel.ProcessId }
    if (Test-Path -LiteralPath $stateFile) { Remove-Item -LiteralPath $stateFile }
    Write-Output 'Debug tunnel closed. Direct network debugging remains blocked.'
    exit 0
}
if ($Action -eq 'Enable') {
    $tunnel = Get-TunnelProcess
    if (-not $tunnel) {
        $sshArguments = @('-N', '-T', '-L', '127.0.0.1:19998:127.0.0.1:9998',
            '-i', $ownerKey, '-o', "UserKnownHostsFile=$knownHosts",
            '-o', 'StrictHostKeyChecking=yes', '-o', 'BatchMode=yes',
            '-o', 'ExitOnForwardFailure=yes', '-o', 'ConnectTimeout=5',
            '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3', $target)
        $arguments = ($sshArguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' '
        $started = Start-Process -FilePath (Get-Command ssh).Source -ArgumentList $arguments -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $projectRoot '.local/tv-debug-tunnel.stdout.log') `
            -RedirectStandardError (Join-Path $projectRoot '.local/tv-debug-tunnel.stderr.log')
        Set-Content -LiteralPath $stateFile -Value $started.Id -Encoding ascii
    }
    for ($attempt = 0; $attempt -lt 6; $attempt++) {
        if (Test-DebugEndpoint) {
            Write-Output "Debugging available through SSH at $endpoint"
            Write-Output "Set MILLER_TV_DEBUG_ENDPOINT=$endpoint for tools/check-tv.mjs."
            exit 0
        }
        Start-Sleep -Milliseconds 300
    }
    $failedTunnel = Get-TunnelProcess
    if ($failedTunnel) { Stop-Process -Id $failedTunnel.ProcessId }
    if (Test-Path -LiteralPath $stateFile) { Remove-Item -LiteralPath $stateFile }
    throw 'The debug tunnel was not ready and has been closed. Check .local/tv-debug-tunnel.stderr.log; the TV may be asleep.'
}
if ((Get-TunnelProcess) -and (Test-DebugEndpoint)) { Write-Output "Debug tunnel active: $endpoint" }
else { Write-Output 'Debug tunnel closed.' }
