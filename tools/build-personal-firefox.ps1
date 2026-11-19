#requires -Version 7.0
[CmdletBinding()]
param([string]$Version)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskConfig = Get-Content (Join-Path $PSScriptRoot 'firefox-personal.json') -Raw | ConvertFrom-Json
if (!$Version) { $Version = $taskConfig.version }
if ($Version -notmatch '^\d+(\.\d+){1,3}$' -or @($Version.Split('.') | Where-Object { [long]$_ -gt 65535 }).Count) {
    throw 'Use a Firefox version of two to four integers, each at most 65535.'
}
if ($taskConfig.id -eq 'keepassxc-browser@keepassxc.org') { throw 'The personal build must use a distinct ID.' }
$taskBuildRoot = Join-Path $taskRoot 'build'
$taskOutput = Join-Path $taskBuildRoot 'firefox-personal'
$taskArchive = Join-Path $taskBuildRoot "keepassxc-browser-personal-$Version.zip"
New-Item -ItemType Directory -Path $taskBuildRoot -Force | Out-Null
if (Test-Path $taskOutput) { Remove-Item -LiteralPath $taskOutput -Recurse -Force }
New-Item -ItemType Directory -Path $taskOutput | Out-Null
Copy-Item -Path (Join-Path $taskRoot 'keepassxc-browser/*') -Destination $taskOutput -Recurse
$taskManifest = Get-Content (Join-Path $taskRoot 'dist/manifest_firefox.json') -Raw | ConvertFrom-Json
$taskGecko = $taskManifest.applications.gecko
$taskManifest.PSObject.Properties.Remove('applications')
$taskGecko.id = $taskConfig.id
$taskGecko.strict_min_version = $taskConfig.strict_min_version
$taskGecko | Add-Member -NotePropertyName data_collection_permissions -NotePropertyValue ([ordered]@{
    required = @('authenticationInfo', 'browsingActivity', 'websiteContent')
}) -Force
$taskManifest | Add-Member -NotePropertyName browser_specific_settings -NotePropertyValue @{gecko = $taskGecko} -Force
$taskManifest | Add-Member -NotePropertyName homepage_url -NotePropertyValue $taskConfig.homepage_url -Force
$taskManifest.name = $taskConfig.name
$taskManifest.version = $Version
$taskManifest.browser_action.default_title = $taskConfig.name
# Manual signed updates for now: no invented update URL or third-party update host.
$taskManifest.PSObject.Properties.Remove('update_url')
$taskManifestText = ($taskManifest | ConvertTo-Json -Depth 30) + "`n"
[IO.File]::WriteAllText((Join-Path $taskOutput 'manifest.json'), $taskManifestText, [Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath (Join-Path $taskRoot 'LICENSE') -Destination (Join-Path $taskOutput 'LICENSE')
if (Test-Path $taskArchive) { Remove-Item -LiteralPath $taskArchive }
Compress-Archive -Path (Join-Path $taskOutput '*') -DestinationPath $taskArchive
$taskCommit = (& git -C $taskRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify the source commit.' }
$taskChanges = @(& git -C $taskRoot status --porcelain --untracked-files=normal)
if ($LASTEXITCODE -ne 0) { throw 'Cannot check source status.' }
# Archive only committed source; local reports, node_modules and credentials are never included.
$taskSourceArchive = Join-Path $taskBuildRoot "keepassxc-browser-personal-$Version-source.zip"
& git -C $taskRoot archive --format=zip "--output=$taskSourceArchive" HEAD
if ($LASTEXITCODE -ne 0) { throw 'Cannot export source archive.' }
$taskBuildInfo = [ordered]@{
    id = $taskConfig.id
    version = $Version
    commit = $taskCommit
    workingTreeClean = ($taskChanges.Count -eq 0)
    packageSha256 = (Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash.ToLowerInvariant()
    sourceSha256 = (Get-FileHash -LiteralPath $taskSourceArchive -Algorithm SHA256).Hash.ToLowerInvariant()
}
$taskInfoPath = Join-Path $taskBuildRoot "keepassxc-browser-personal-$Version-build.json"
[IO.File]::WriteAllText($taskInfoPath, (($taskBuildInfo | ConvertTo-Json) + "`n"), [Text.UTF8Encoding]::new($false))
if ($taskChanges.Count) { Write-Warning 'The package contains local changes that are absent from the committed source archive. Commit them and rebuild before submitting.' }
Write-Host "Unsigned package: $taskArchive"
Write-Host "Committed source: $taskSourceArchive"
Write-Host "Build record:     $taskInfoPath"
Write-Host "Firefox add-on:   $($taskConfig.id) / $Version"
