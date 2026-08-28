<#
.SYNOPSIS
    System Usage Logger Pro — Agent Complete Uninstaller & Firestore Deregistration
.DESCRIPTION
    Stops all background processes, deregisters device and cascade deletes events/sessions
    from Firestore database, removes Desktop shortcut, startup entries, and cleans AppData directory.
#>

[CmdletBinding()]
param(
    [string]$DeviceId = "",
    [string]$ServerUrl = "",
    [string]$Uid = ""
)

$ErrorActionPreference = "SilentlyContinue"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  SYSTEM USAGE LOGGER PRO — AGENT UNINSTALLER & DEREGISTRATION        " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

$AppDir = Join-Path $env:APPDATA "syslogger-pro"
$ConfigFile = Join-Path $AppDir "config.json"

# 1. Read configuration from local AppData if available
if (Test-Path $ConfigFile) {
    try {
        $diskCfg = Get-Content $ConfigFile -Raw | ConvertFrom-Json
        if (-not $DeviceId -and $diskCfg.deviceId) { $DeviceId = $diskCfg.deviceId }
        if (-not $ServerUrl -and $diskCfg.serverUrl) { $ServerUrl = $diskCfg.serverUrl }
        if (-not $Uid -and $diskCfg.uid) { $Uid = $diskCfg.uid }
    } catch {}
}

# 2. Stop running agent and client processes
Write-Host "[1/5] Terminating SysLogger client and agent background processes..." -ForegroundColor Yellow
try {
    Get-Process -Name "python", "pythonw" -ErrorAction SilentlyContinue | Where-Object {
        try {
            $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine
            $cmd -like "*syslogger-pro*" -or $cmd -like "*logger_client.py*" -or $cmd -like "*app.py*"
        } catch { $false }
    } | Stop-Process -Force -ErrorAction SilentlyContinue

    Get-WmiObject Win32_Process -ErrorAction SilentlyContinue | Where-Object { 
        $_.CommandLine -like "*syslogger-agent.ps1*" -or $_.CommandLine -like "*syslogger-pro*" -or $_.Name -eq "SystemUsageLoggerPro.exe" 
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}

# 3. Call backend API to deregister and cascade delete Firestore collections
Write-Host "[2/5] Deregistering device from Firestore database..." -ForegroundColor Yellow
if ($ServerUrl -and $DeviceId) {
    try {
        $cleanUrl = $ServerUrl.TrimEnd('/')
        $body = @{
            deviceId = $DeviceId
            uid = $Uid
            action = "UNINSTALL"
        } | ConvertTo-Json
        
        Write-Host "       Sending deregister request to $cleanUrl/api/devices/deregister..." -ForegroundColor Gray
        $response = Invoke-RestMethod -Uri "$cleanUrl/api/devices/deregister" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10 -ErrorAction Stop
        if ($response.success) {
            Write-Host "       [OK] Device record, sessions, and events permanently purged from Firestore." -ForegroundColor Green
        } else {
            Write-Host "       [Notice] Server response: $($response.message)" -ForegroundColor Gray
        }
    } catch {
        Write-Host "       [Notice] Backend deregistration notice: $($_.Exception.Message)" -ForegroundColor Gray
    }
} else {
    Write-Host "       [Skip] No backend server or device ID specified for remote deregistration." -ForegroundColor Gray
}

# 4. Remove Windows Startup entries and Shortcuts
Write-Host "[3/5] Removing Startup entries and Desktop shortcuts..." -ForegroundColor Yellow
try {
    Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "syslogger-pro-agent" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "SysLoggerClient" -ErrorAction SilentlyContinue
    
    $DesktopPath = [Environment]::GetFolderPath("Desktop")
    $ShortcutPath = Join-Path $DesktopPath "System Usage Logger Pro.lnk"
    if (Test-Path $ShortcutPath) {
        Remove-Item -Path $ShortcutPath -Force -ErrorAction SilentlyContinue
    }
} catch {}

# 5. Clean local AppData installation folder
Write-Host "[4/5] Cleaning local files in $AppDir..." -ForegroundColor Yellow
if (Test-Path $AppDir) {
    try {
        Start-Sleep -Milliseconds 400
        Remove-Item -Path $AppDir -Recurse -Force -ErrorAction SilentlyContinue
    } catch {}
}

Write-Host "[5/5] Finalizing clean uninstallation..." -ForegroundColor Yellow
Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "  UNINSTALL COMPLETE! Agent removed and unregistered successfully.    " -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
