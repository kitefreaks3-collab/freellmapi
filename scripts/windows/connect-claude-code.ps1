[CmdletBinding()]
param(
  [string]$BaseUrl = "http://127.0.0.1:31415",
  [string]$ApiKey
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "FreeLLMAPI -> Claude Code connector" -ForegroundColor Cyan
Write-Host "This keeps your existing Claude Code settings and only merges the FreeLLMAPI endpoint."
Write-Host ""

if (-not $ApiKey) {
  $secure = Read-Host "Paste the Unified API Key shown in FreeLLMAPI > Keys > API Key" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $ApiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
if ([string]::IsNullOrWhiteSpace($ApiKey)) { throw "API key is required." }

$BaseUrl = $BaseUrl.TrimEnd("/")
$settingsDir = Join-Path $env:USERPROFILE ".claude"
$settingsPath = Join-Path $settingsDir "settings.json"
New-Item -ItemType Directory -Force -Path $settingsDir | Out-Null

function ConvertTo-Hashtable($InputObject) {
  if ($null -eq $InputObject) { return $null }
  if ($InputObject -is [System.Collections.IDictionary]) {
    $result = @{}
    foreach ($key in $InputObject.Keys) { $result[$key] = ConvertTo-Hashtable $InputObject[$key] }
    return $result
  }
  if ($InputObject -is [System.Management.Automation.PSCustomObject]) {
    $result = @{}
    foreach ($property in $InputObject.PSObject.Properties) { $result[$property.Name] = ConvertTo-Hashtable $property.Value }
    return $result
  }
  if ($InputObject -is [System.Array]) {
    return ,@($InputObject | ForEach-Object { ConvertTo-Hashtable $_ })
  }
  return $InputObject
}

$settings = @{}
if (Test-Path $settingsPath) {
  $raw = Get-Content -Raw -Path $settingsPath
  if (-not [string]::IsNullOrWhiteSpace($raw)) {
    try { $settings = ConvertTo-Hashtable ($raw | ConvertFrom-Json) }
    catch { throw "Existing Claude settings.json is invalid JSON. No changes were made. Fix it first: $settingsPath" }
  }
}

if (-not $settings.ContainsKey("env") -or $settings["env"] -isnot [System.Collections.IDictionary]) {
  $settings["env"] = @{}
}
$settings["env"]["ANTHROPIC_BASE_URL"] = $BaseUrl
$settings["env"]["ANTHROPIC_AUTH_TOKEN"] = $ApiKey
$settings["env"]["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"] = "1"

$backup = $null
if (Test-Path $settingsPath) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backup = "$settingsPath.backup-$stamp"
  Copy-Item -LiteralPath $settingsPath -Destination $backup
}

$json = $settings | ConvertTo-Json -Depth 100
$tmp = "$settingsPath.tmp"
[System.IO.File]::WriteAllText($tmp, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
Move-Item -Force -LiteralPath $tmp -Destination $settingsPath

Write-Host ""
Write-Host "Claude Code is configured." -ForegroundColor Green
Write-Host "Base URL: $BaseUrl"
Write-Host "Settings: $settingsPath"
if ($backup) { Write-Host "Backup:   $backup" }
Write-Host "Restart Claude Code to use FreeLLMAPI."
