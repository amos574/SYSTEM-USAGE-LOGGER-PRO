<#
.SYNOPSIS
    System Usage Logger Pro — Python Desktop Client Automated Setup
.DESCRIPTION
    Configures Python 3 environment, installs required packages, binds user UID,
    and creates a Desktop launcher shortcut.
#>

[CmdletBinding()]
param(
    [string]$Uid = "",
    [string]$DeviceId = "",
    [string]$ServerUrl = "https://ais-pre-425pifb7xfy75tn3xngn3f-590412783680.asia-east1.run.app"
)

$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  SYSTEM USAGE LOGGER PRO — PYTHON DESKTOP CLIENT INSTALLER" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Detect Python 3
Write-Host "[1/5] Detecting Python 3 environment..." -ForegroundColor Yellow
$PythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $PythonCmd = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $PythonCmd = "py -3"
}

if (-not $PythonCmd) {
    Write-Host "[ERROR] Python 3 is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install Python from https://www.python.org/downloads/ (Check 'Add Python to PATH')" -ForegroundColor Red
    exit 1
}

$PyVersion = (& $PythonCmd --version 2>&1)
Write-Host "       Found $PyVersion" -ForegroundColor Green

# 2. Setup AppData directory and configuration
Write-Host "[2/5] Initializing local configuration..." -ForegroundColor Yellow
$AppDir = Join-Path $env:APPDATA "syslogger-pro"
$LogsDir = Join-Path $AppDir "logs"
$ConfigFile = Join-Path $AppDir "config.json"

if (-not (Test-Path $AppDir)) { New-Item -ItemType Directory -Path $AppDir -Force | Out-Null }
if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null }

if (-not $DeviceId) {
    $cleanHost = ($env:COMPUTERNAME -replace '[^a-zA-Z0-9-]', '').Substring(0, [Math]::Min(12, $env:COMPUTERNAME.Length)).ToUpper()
    $DeviceId = "PC-$cleanHost"
}

$configObj = @{
    uid = $Uid
    deviceId = $DeviceId
    deviceName = $env:COMPUTERNAME
    serverUrl = $ServerUrl.TrimEnd('/')
    agentVersion = "1.0.3"
    clientType = "Python-Native"
    installedAt = (Get-Date).ToUniversalTime().ToString("o")
}

$configJson = $configObj | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($ConfigFile, $configJson, [System.Text.Encoding]::UTF8)
Write-Host "       Saved config to: $ConfigFile" -ForegroundColor Green

# 3. Install dependencies
Write-Host "[3/5] Installing Python requirements..." -ForegroundColor Yellow
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ReqFile = Join-Path $ScriptDir "requirements.txt"

if (Test-Path $ReqFile) {
    & $PythonCmd -m pip install --quiet --upgrade pip
    & $PythonCmd -m pip install --quiet -r $ReqFile
    Write-Host "       Dependencies installed successfully." -ForegroundColor Green
} else {
    Write-Host "       Installing requests and customtkinter directly..." -ForegroundColor Gray
    & $PythonCmd -m pip install --quiet requests customtkinter
}

# 4. Create Desktop Shortcut
Write-Host "[4/5] Creating Desktop Shortcut..." -ForegroundColor Yellow
try {
    $WshShell = New-Object -ComObject WScript.Shell
    $DesktopPath = [Environment]::GetFolderPath("Desktop")
    $ShortcutPath = Join-Path $DesktopPath "System Usage Logger Pro.lnk"
    $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
    
    $BatchLauncher = Join-Path $ScriptDir "run.bat"
    if (Test-Path $BatchLauncher) {
        $Shortcut.TargetPath = $BatchLauncher
        $Shortcut.WorkingDirectory = $ScriptDir
    } else {
        $Shortcut.TargetPath = $PythonCmd
        $Shortcut.Arguments = "`"$ScriptDir\app.py`""
        $Shortcut.WorkingDirectory = $ScriptDir
    }
    $Shortcut.Description = "System Usage Logger Pro Desktop Client"
    $Shortcut.Save()
    Write-Host "       Created shortcut on Desktop." -ForegroundColor Green
} catch {
    Write-Host "       Could not create shortcut: $_" -ForegroundColor Gray
}

# 5. Launch Client
Write-Host "[5/5] Launching System Usage Logger Pro Client..." -ForegroundColor Cyan
Start-Process -FilePath $PythonCmd -ArgumentList "`"$ScriptDir\app.py`"" -WorkingDirectory $ScriptDir

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "  SETUP COMPLETE! Desktop Client is now active." -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
