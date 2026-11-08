param(
    [Parameter(Mandatory = $true)]
    [string]$RemoteCommand
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$devicePath = Join-Path $projectRoot 'tv/device.json'
if (-not (Test-Path -LiteralPath $devicePath)) { throw 'Copy tv/device.example.json to tv/device.json and configure your TV locally.' }
$device = Get-Content -LiteralPath $devicePath -Raw | ConvertFrom-Json
$target = $device.user + '@' + $device.host
$keyPath = Join-Path $projectRoot '.local/tv_owner_ed25519'
$knownHosts = Join-Path $projectRoot '.local/known_hosts'
if (-not (Test-Path -LiteralPath $keyPath)) {
    throw 'The private TV key is missing. It is intentionally excluded from Git.'
}
& ssh -i $keyPath -o "UserKnownHostsFile=$knownHosts" -o StrictHostKeyChecking=yes -o BatchMode=yes -o ConnectTimeout=5 $target $RemoteCommand
exit $LASTEXITCODE
