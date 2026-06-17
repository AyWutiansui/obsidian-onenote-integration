# Advanced OneNote Diagnostic - Check Version and Notebooks
Write-Host "=== Advanced OneNote Diagnostic ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check OneNote version
Write-Host "[Step 1] Checking OneNote version..." -ForegroundColor Yellow

# Method 1: Check installed programs
$onenotePaths = @(
    "C:\Program Files\Microsoft Office\root\Office16\ONENOTE.EXE",
    "C:\Program Files (x86)\Microsoft Office\root\Office16\ONENOTE.EXE",
    "C:\Program Files\Microsoft Office\Office16\ONENOTE.EXE",
    "C:\Program Files (x86)\Microsoft Office\Office16\ONENOTE.EXE"
)

$foundDesktop = $false
foreach ($path in $onenotePaths) {
    if (Test-Path $path) {
        Write-Host "  ✓ Found OneNote Desktop at: $path" -ForegroundColor Green
        $foundDesktop = $true
        break
    }
}

if (-not $foundDesktop) {
    # Check if it's the UWP version
    try {
        $uwpApp = Get-AppxPackage -Name "Microsoft.Office.OneNote"
        Write-Host "  ⚠ Found OneNote for Windows 10 (UWP)" -ForegroundColor Yellow
        Write-Host "    This version does NOT support COM automation!" -ForegroundColor Red
        Write-Host "    Please install OneNote Desktop from:" -ForegroundColor Yellow
        Write-Host "    https://www.onenote.com/download" -ForegroundColor Gray
    } catch {
        Write-Host "  ✗ OneNote not found in standard locations" -ForegroundColor Red
    }
}

# Step 2: Check running process details
Write-Host ""
Write-Host "[Step 2] Checking running OneNote process..." -ForegroundColor Yellow
$onenoteProcess = Get-Process -Name "ONENOTE" -ErrorAction SilentlyContinue
if ($onenoteProcess) {
    Write-Host "  Process Name: $($onenoteProcess.ProcessName)" -ForegroundColor Gray
    Write-Host "  Process ID: $($onenoteProcess.Id)" -ForegroundColor Gray
    Write-Host "  Executable Path: $($onenoteProcess.Path)" -ForegroundColor Gray

    if ($onenoteProcess.Path -like "*Office16*" -or $onenoteProcess.Path -like "*Microsoft Office*") {
        Write-Host "  ✓ This is OneNote Desktop" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ This might be OneNote for Windows 10 (UWP)" -ForegroundColor Yellow
        Write-Host "    COM automation may not work" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ✗ OneNote is not running" -ForegroundColor Red
    exit 1
}

# Step 3: Try COM API with different parameters
Write-Host ""
Write-Host "[Step 3] Testing COM API with different scopes..." -ForegroundColor Yellow

try {
    $oneNote = New-Object -ComObject OneNote.Application
    Write-Host "  ✓ COM object created" -ForegroundColor Green

    # Try different hierarchy scopes
    Write-Host ""
    Write-Host "  Testing scope 0 (hsNotebooks)..." -ForegroundColor Gray
    $xml0 = ""
    $oneNote.GetHierarchy("", 0, [ref]$xml0)
    Write-Host "    XML Length: $($xml0.Length)" -ForegroundColor Gray

    if ($xml0.Length -gt 50) {
        Write-Host "    ✓ Got data" -ForegroundColor Green
        # Save for analysis
        $xml0 | Out-File "$env:TEMP\onenote-scope0.xml" -Encoding UTF8
        Write-Host "    Saved to: $env:TEMP\onenote-scope0.xml" -ForegroundColor Gray
    } else {
        Write-Host "    ⚠ Empty or minimal data" -ForegroundColor Yellow
        Write-Host "    XML Content:" -ForegroundColor Gray
        Write-Host "    $xml0" -ForegroundColor Gray
    }

    Write-Host ""
    Write-Host "  Testing scope 1 (hsSections)..." -ForegroundColor Gray
    $xml1 = ""
    try {
        $oneNote.GetHierarchy("", 1, [ref]$xml1)
        Write-Host "    XML Length: $($xml1.Length)" -ForegroundColor Gray
        if ($xml1.Length -gt 50) {
            Write-Host "    ✓ Got data" -ForegroundColor Green
        } else {
            Write-Host "    ⚠ Empty or minimal data" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "    ✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "  Testing scope 2 (hsPages)..." -ForegroundColor Gray
    $xml2 = ""
    try {
        $oneNote.GetHierarchy("", 2, [ref]$xml2)
        Write-Host "    XML Length: $($xml2.Length)" -ForegroundColor Gray
        if ($xml2.Length -gt 50) {
            Write-Host "    ✓ Got data" -ForegroundColor Green
        } else {
            Write-Host "    ⚠ Empty or minimal data" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "    ✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
    }

} catch {
    Write-Host "  ✗ COM API failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 4: Check OneNote default notebook location
Write-Host ""
Write-Host "[Step 4] Checking OneNote notebook locations..." -ForegroundColor Yellow

$notebookLocations = @(
    "$env:USERPROFILE\Documents\OneNote Notebooks",
    "$env:LOCALAPPDATA\Microsoft\OneNote\16.0",
    "$env:APPDATA\Microsoft\OneNote\16.0"
)

foreach ($location in $notebookLocations) {
    if (Test-Path $location) {
        Write-Host "  ✓ Found: $location" -ForegroundColor Green
        $files = Get-ChildItem -Path $location -Recurse -Filter "*.one" -ErrorAction SilentlyContinue
        if ($files) {
            Write-Host "    Found $($files.Count) .one file(s)" -ForegroundColor Green
            foreach ($file in $files) {
                Write-Host "      - $($file.Name)" -ForegroundColor Gray
            }
        } else {
            Write-Host "    No .one files found" -ForegroundColor Yellow
        }
    }
}

# Step 5: Check OneDrive sync
Write-Host ""
Write-Host "[Step 5] Checking OneDrive notebooks..." -ForegroundColor Yellow

$oneDrivePath = "$env:USERPROFILE\OneDrive\Documents\OneNote Notebooks"
if (Test-Path $oneDrivePath) {
    Write-Host "  ✓ OneDrive notebooks folder exists: $oneDrivePath" -ForegroundColor Green
    $folders = Get-ChildItem -Path $oneDrivePath -Directory -ErrorAction SilentlyContinue
    if ($folders) {
        Write-Host "    Found $($folders.Count) notebook folder(s):" -ForegroundColor Green
        foreach ($folder in $folders) {
            Write-Host "      - $($folder.Name)" -ForegroundColor Gray
        }
    } else {
        Write-Host "    No notebook folders found" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠ OneDrive notebooks folder not found" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Diagnostic Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Check the XML files in %TEMP% starting with 'onenote-'" -ForegroundColor Gray
Write-Host "2. Look for <one:Notebook elements in the XML" -ForegroundColor Gray
Write-Host "3. If XML is empty, your notebooks might be stored online only" -ForegroundColor Gray
Write-Host ""
