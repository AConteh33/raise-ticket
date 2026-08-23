$projectRoot = Split-Path $PSScriptRoot -Parent
$launcher = Join-Path $PSScriptRoot "start-backend-and-ngrok.cmd"
$backendOnly = Join-Path $PSScriptRoot "start-backend.cmd"
$desktop = [Environment]::GetFolderPath("Desktop")

function New-Shortcut($name, $target, $description) {
  $path = Join-Path $desktop "$name.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($path)
  $shortcut.TargetPath = $target
  $shortcut.WorkingDirectory = $projectRoot
  $shortcut.Description = $description
  $shortcut.WindowStyle = 1
  $shortcut.Save()
  Write-Host "Created: $path"
}

# Remove old shortcut names if present
foreach ($old in @("Issue Tracker Backend + ngrok")) {
  $p = Join-Path $desktop "$old.lnk"
  if (Test-Path $p) { Remove-Item $p -Force; Write-Host "Removed old: $p" }
}

New-Shortcut `
  "Issue Tracker" `
  $launcher `
  "Start backend (API + database) and ngrok tunnel"

New-Shortcut `
  "Issue Tracker (backend only)" `
  $backendOnly `
  "Start API server and SQLite database only (no ngrok)"
