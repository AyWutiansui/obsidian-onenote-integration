# Debug OneNote Notebooks - Comprehensive Diagnostic
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "OneNote Notebook Diagnostic Tool" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check OneNote process
Write-Host "[Step 1] Checking OneNote process..." -ForegroundColor Yellow
$onenoteProcess = Get-Process ONENOTE -ErrorAction SilentlyContinue
if ($onenoteProcess) {
    Write-Host "  OneNote is running (PID: $($onenoteProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "  WARNING: OneNote is NOT running!" -ForegroundColor Red
    Write-Host "  Please start OneNote and try again." -ForegroundColor Red
    exit 1
}

# Step 2: Create COM object
Write-Host "`n[Step 2] Creating COM object..." -ForegroundColor Yellow
try {
    $oneNote = New-Object -ComObject OneNote.Application
    Write-Host "  COM object created successfully" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Failed to create COM object" -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 3: Get notebooks hierarchy
Write-Host "`n[Step 3] Getting notebooks hierarchy..." -ForegroundColor Yellow
$xml = ""
try {
    $oneNote.GetHierarchy("", 0, [ref]$xml)
    Write-Host "  GetHierarchy succeeded" -ForegroundColor Green
    Write-Host "  XML length: $($xml.Length) characters" -ForegroundColor White
} catch {
    Write-Host "  ERROR: GetHierarchy failed" -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 4: Parse XML
Write-Host "`n[Step 4] Parsing XML..." -ForegroundColor Yellow
if ([string]::IsNullOrEmpty($xml)) {
    Write-Host "  ERROR: XML is empty" -ForegroundColor Red
    exit 1
}

Write-Host "  XML Content:" -ForegroundColor White
Write-Host "  $xml" -ForegroundColor Gray

# Try to parse with XML parser
try {
    $xmlDoc = New-Object System.Xml.XmlDocument
    $xmlDoc.LoadXml($xml)

    # Set namespace manager
    $nsManager = New-Object System.Xml.XmlNamespaceManager($xmlDoc.NameTable)
    $nsManager.AddNamespace("one", "http://schemas.microsoft.com/office/onenote/2013/onenote")

    # Find notebooks
    $notebookNodes = $xmlDoc.SelectNodes("//one:Notebook", $nsManager)
    Write-Host "`n  Found $($notebookNodes.Count) notebook(s)" -ForegroundColor White

    if ($notebookNodes.Count -eq 0) {
        Write-Host "`n  *** NO NOTEBOOKS FOUND ***" -ForegroundColor Red
        Write-Host "`n  This means:" -ForegroundColor Yellow
        Write-Host "  - OneNote is running but has no notebooks created yet" -ForegroundColor Yellow
        Write-Host "  - OR notebooks are stored in a different location" -ForegroundColor Yellow
        Write-Host "  - OR OneNote hasn't finished syncing" -ForegroundColor Yellow
        Write-Host "`n  Solution:" -ForegroundColor Cyan
        Write-Host "  1. Open OneNote application" -ForegroundColor Cyan
        Write-Host "  2. Create at least one notebook (File -> New)" -ForegroundColor Cyan
        Write-Host "  3. Wait for the notebook to be created" -ForegroundColor Cyan
        Write-Host "  4. Run this diagnostic again" -ForegroundColor Cyan
    } else {
        foreach ($notebook in $notebookNodes) {
            Write-Host "`n  Notebook Details:" -ForegroundColor Green
            Write-Host "    Name: $($notebook.name)" -ForegroundColor White
            Write-Host "    ID: $($notebook.ID)" -ForegroundColor White
            Write-Host "    Nickname: $($notebook.nickname)" -ForegroundColor White
            Write-Host "    Path: $($notebook.path)" -ForegroundColor White
        }
    }
} catch {
    Write-Host "  ERROR parsing XML: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 5: Check common notebook locations
Write-Host "`n[Step 5] Checking common notebook locations..." -ForegroundColor Yellow
$locations = @(
    "$env:USERPROFILE\OneNote Notebooks",
    "$env:USERPROFILE\Documents\OneNote Notebooks",
    "$env:LOCALAPPDATA\Microsoft\OneNote\16.0"
)

foreach ($loc in $locations) {
    if (Test-Path $loc) {
        Write-Host "  Found: $loc" -ForegroundColor Green
        Get-ChildItem $loc -Directory | ForEach-Object {
            Write-Host "    - $($_.Name)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  Not found: $loc" -ForegroundColor DarkGray
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Diagnostic complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
