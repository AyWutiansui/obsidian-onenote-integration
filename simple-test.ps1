# Simple OneNote Test - Step by Step
Write-Host "=== Simple OneNote COM Test ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if OneNote process is running
Write-Host "[Step 1] Checking OneNote process..." -ForegroundColor Yellow
$onenoteProcess = Get-Process -Name "ONENOTE" -ErrorAction SilentlyContinue
if ($onenoteProcess) {
    Write-Host "  ✓ OneNote is running (PID: $($onenoteProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "  ✗ OneNote is NOT running!" -ForegroundColor Red
    Write-Host "  → Please start OneNote desktop application first" -ForegroundColor Yellow
    exit 1
}

# Step 2: Try to create COM object
Write-Host ""
Write-Host "[Step 2] Creating COM object..." -ForegroundColor Yellow
try {
    $oneNote = New-Object -ComObject OneNote.Application
    Write-Host "  ✓ COM object created successfully" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Failed to create COM object" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 3: Call GetHierarchy
Write-Host ""
Write-Host "[Step 3] Calling GetHierarchy..." -ForegroundColor Yellow
try {
    $xml = ""
    $oneNote.GetHierarchy("", 0, [ref]$xml)

    if ([string]::IsNullOrEmpty($xml)) {
        Write-Host "  ✗ GetHierarchy returned empty XML" -ForegroundColor Red
        Write-Host "  → This might mean:" -ForegroundColor Yellow
        Write-Host "     - OneNote has no notebooks" -ForegroundColor Yellow
        Write-Host "     - OneNote is still loading" -ForegroundColor Yellow
        Write-Host "     - COM API issue" -ForegroundColor Yellow
        exit 1
    }

    Write-Host "  ✓ GetHierarchy returned $($xml.Length) characters" -ForegroundColor Green

    # Save XML to file
    $xmlFile = "$env:TEMP\onenote-simple-test.xml"
    $xml | Out-File -FilePath $xmlFile -Encoding UTF8
    Write-Host "  ✓ XML saved to: $xmlFile" -ForegroundColor Green

} catch {
    Write-Host "  ✗ GetHierarchy failed" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 4: Parse XML to find notebooks
Write-Host ""
Write-Host "[Step 4] Parsing XML for notebooks..." -ForegroundColor Yellow

try {
    $xmlDoc = [xml]$xml

    # Set up namespace manager
    $nsManager = New-Object System.Xml.XmlNamespaceManager($xmlDoc.NameTable)
    $nsManager.AddNamespace("one", "http://schemas.microsoft.com/office/onenote/2013/one-note")

    # Find notebooks
    $notebooks = $xmlDoc.SelectNodes("//one:Notebook", $nsManager)

    if ($notebooks -and $notebooks.Count -gt 0) {
        Write-Host "  ✓ Found $($notebooks.Count) notebook(s):" -ForegroundColor Green
        Write-Host ""

        foreach ($nb in $notebooks) {
            Write-Host "    Notebook Name: $($nb.name)" -ForegroundColor Cyan
            Write-Host "    Notebook ID: $($nb.ID)" -ForegroundColor Gray
            Write-Host ""
        }

        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "SUCCESS! OneNote is working correctly." -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Cyan
    } else {
        Write-Host "  ⚠ No notebooks found in XML" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  This means OneNote is running but has no notebooks." -ForegroundColor Yellow
        Write-Host "  Please create at least one notebook in OneNote." -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ✗ Failed to parse XML" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red

    # Show XML preview
    Write-Host ""
    Write-Host "XML Preview (first 500 chars):" -ForegroundColor Gray
    Write-Host $xml.Substring(0, [Math]::Min(500, $xml.Length)) -ForegroundColor Gray
}

Write-Host ""
