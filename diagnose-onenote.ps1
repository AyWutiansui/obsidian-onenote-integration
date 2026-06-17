# OneNote Detection Diagnostic Script
# Run this in PowerShell to check if OneNote is properly configured

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "OneNote Detection Diagnostic Tool" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check 1: Is OneNote installed?
Write-Host "[1/5] Checking OneNote installation..." -ForegroundColor Yellow

$commonPaths = @(
    "C:\Program Files\Microsoft Office\root\Office16\ONENOTE.EXE",
    "C:\Program Files (x86)\Microsoft Office\root\Office16\ONENOTE.EXE",
    "C:\Program Files\Microsoft Office\Office16\ONENOTE.EXE",
    "C:\Program Files (x86)\Microsoft Office\Office16\ONENOTE.EXE",
    "C:\Program Files\Microsoft Office\Office15\ONENOTE.EXE",
    "C:\Program Files (x86)\Microsoft Office\Office15\ONENOTE.EXE"
)

$found = $false
foreach ($path in $commonPaths) {
    if (Test-Path $path) {
        Write-Host "  ✓ Found OneNote at: $path" -ForegroundColor Green
        $found = $true
        break
    }
}

if (-not $found) {
    Write-Host "  ✗ OneNote not found in common locations" -ForegroundColor Red
}

# Check 2: Registry lookup
Write-Host ""
Write-Host "[2/5] Checking Windows Registry..." -ForegroundColor Yellow

try {
    $regPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\ONENOTE.EXE"
    $regValue = Get-ItemProperty -Path $regPath -ErrorAction Stop
    Write-Host "  ✓ Found in registry: $($regValue.'(Default)')" -ForegroundColor Green
} catch {
    try {
        $regPath = "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\ONENOTE.EXE"
        $regValue = Get-ItemProperty -Path $regPath -ErrorAction Stop
        Write-Host "  ✓ Found in registry (WOW64): $($regValue.'(Default)')" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Not found in registry" -ForegroundColor Red
    }
}

# Check 3: Is OneNote running?
Write-Host ""
Write-Host "[3/5] Checking if OneNote is running..." -ForegroundColor Yellow

$onenoteProcess = Get-Process -Name "ONENOTE" -ErrorAction SilentlyContinue
if ($onenoteProcess) {
    Write-Host "  ✓ OneNote is running (PID: $($onenoteProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "  ✗ OneNote is not running" -ForegroundColor Red
    Write-Host "    → Please start OneNote application" -ForegroundColor Yellow
}

# Check 4: COM object test
Write-Host ""
Write-Host "[4/5] Testing COM object creation..." -ForegroundColor Yellow

try {
    $oneNote = New-Object -ComObject OneNote.Application
    $xml = ""
    $oneNote.GetHierarchy("", 0, [ref]$xml)

    if ($xml -and $xml.Length -gt 0) {
        Write-Host "  ✓ COM object created successfully" -ForegroundColor Green

        # Count notebooks
        $notebookCount = ([xml]$xml).SelectNodes("//one:Notebook", @{one="http://schemas.microsoft.com/office/onenote/2013/one-note"}).Count
        Write-Host "  ✓ Found $notebookCount notebook(s)" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ COM object created but no data returned" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ✗ Failed to create COM object" -ForegroundColor Red
    Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Check 5: PowerShell execution policy
Write-Host ""
Write-Host "[5/5] Checking PowerShell execution policy..." -ForegroundColor Yellow

$policy = Get-ExecutionPolicy -Scope CurrentUser
if ($policy -eq "Restricted") {
    Write-Host "  ✗ Execution policy is Restricted" -ForegroundColor Red
    Write-Host "    → Run: Set-ExecutionPolicy RemoteSigned -Scope CurrentUser" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ Execution policy: $policy" -ForegroundColor Green
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($found -and $onenoteProcess) {
    Write-Host "✓ OneNote appears to be properly configured" -ForegroundColor Green
    Write-Host "  You should be able to use local mode in the plugin" -ForegroundColor Green
} else {
    Write-Host "✗ Issues detected" -ForegroundColor Red
    Write-Host ""
    Write-Host "Recommended actions:" -ForegroundColor Yellow

    if (-not $found) {
        Write-Host "  1. Install OneNote Desktop (not UWP from Microsoft Store)" -ForegroundColor Yellow
        Write-Host "     Download: https://www.onenote.com/download" -ForegroundColor Gray
    }

    if (-not $onenoteProcess) {
        Write-Host "  2. Start OneNote application before using the plugin" -ForegroundColor Yellow
    }

    if ($policy -eq "Restricted") {
        Write-Host "  3. Change PowerShell execution policy" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "For more help, see LOCAL_MODE_TROUBLESHOOTING.md" -ForegroundColor Cyan
Write-Host ""
