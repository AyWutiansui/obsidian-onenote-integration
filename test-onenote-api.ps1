# Test OneNote COM API and display notebook hierarchy
# Run this in PowerShell to test if the COM API is working correctly

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "OneNote COM API Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

try {
    Write-Host "[1/3] Creating OneNote COM object..." -ForegroundColor Yellow
    $oneNote = New-Object -ComObject OneNote.Application
    Write-Host "  ✓ COM object created successfully" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Failed to create COM object" -ForegroundColor Red
    Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/3] Getting notebook hierarchy..." -ForegroundColor Yellow

try {
    $xml = ""
    # HierarchyScope: 0 = hs notebooks
    $oneNote.GetHierarchy("", 0, [ref]$xml)

    if (-not $xml -or $xml.Length -eq 0) {
        Write-Host "  ✗ No data returned from GetHierarchy" -ForegroundColor Red
        exit 1
    }

    Write-Host "  ✓ Received $($xml.Length) bytes of XML data" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Failed to get hierarchy" -ForegroundColor Red
    Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[3/3] Parsing XML..." -ForegroundColor Yellow

try {
    # Save XML to file for inspection
    $xmlFile = "$env:TEMP\onenote-hierarchy.xml"
    $xml | Out-File -FilePath $xmlFile -Encoding UTF8
    Write-Host "  ✓ XML saved to: $xmlFile" -ForegroundColor Green

    # Parse XML
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
            Write-Host "    📔 $($nb.name)" -ForegroundColor Cyan
            Write-Host "       ID: $($nb.ID)" -ForegroundColor Gray
            Write-Host "       Last Modified: $($nb.lastModifiedTime)" -ForegroundColor Gray
            Write-Host ""
        }
    } else {
        Write-Host "  ⚠ No notebooks found in XML" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "XML structure:" -ForegroundColor Gray

        # Try to find what's in the XML
        $allNodes = $xmlDoc.SelectNodes("//*[@name]", $nsManager)
        if ($allNodes -and $allNodes.Count -gt 0) {
            Write-Host "  Found $($allNodes.Count) nodes with 'name' attribute:" -ForegroundColor Gray
            foreach ($node in $allNodes) {
                Write-Host "    - $($node.LocalName): $($node.GetAttribute('name'))" -ForegroundColor Gray
            }
        } else {
            Write-Host "  No nodes with 'name' attribute found" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "  ✗ Failed to parse XML" -ForegroundColor Red
    Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red

    # Show first 500 chars of XML for debugging
    Write-Host ""
    Write-Host "XML preview (first 500 chars):" -ForegroundColor Gray
    Write-Host $xml.Substring(0, [Math]::Min(500, $xml.Length)) -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "If you see notebooks listed above, the COM API is working correctly." -ForegroundColor Cyan
Write-Host "If not, check the error messages and XML structure for clues." -ForegroundColor Cyan
Write-Host ""
