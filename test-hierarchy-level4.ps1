# Test script to verify OneNote hierarchy retrieval using Level 4 (hsPages)
# This is the CORRECT level for getting complete hierarchy with pages

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing OneNote Hierarchy Level 4" -ForegroundColor Cyan
Write-Host "(Complete hierarchy with pages)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

try {
    # Create OneNote COM object
    Write-Host "[Step 1] Creating OneNote COM object..." -ForegroundColor Yellow
    $oneNote = New-Object -ComObject OneNote.Application
    Write-Host "SUCCESS: OneNote COM object created" -ForegroundColor Green
    Write-Host ""

    # Get complete hierarchy using level 4
    Write-Host "[Step 2] Getting complete hierarchy (Level 4 - hsPages)..." -ForegroundColor Yellow
    $xml = ""
    $oneNote.GetHierarchy("", 4, [ref]$xml)

    if ([string]::IsNullOrEmpty($xml)) {
        Write-Host "ERROR: Empty XML returned from GetHierarchy" -ForegroundColor Red
        exit 1
    }

    Write-Host "SUCCESS: Retrieved hierarchy data" -ForegroundColor Green
    Write-Host "Data length: $($xml.Length) characters" -ForegroundColor White
    Write-Host ""

    # Display first 2000 characters for debugging
    Write-Host "XML Preview (first 2000 chars):" -ForegroundColor Cyan
    Write-Host $xml.Substring(0, [Math]::Min(2000, $xml.Length))
    Write-Host ""

    # Parse XML
    Write-Host "[Step 3] Parsing XML structure..." -ForegroundColor Yellow
    
    $xmlDoc = New-Object System.Xml.XmlDocument
    $xmlDoc.LoadXml($xml)
    $nsManager = New-Object System.Xml.XmlNamespaceManager($xmlDoc.NameTable)
    $nsManager.AddNamespace("one", "http://schemas.microsoft.com/office/onenote/2013/onenote")

    # Find all notebooks
    $notebookNodes = $xmlDoc.SelectNodes("//one:Notebook", $nsManager)
    Write-Host "Found $($notebookNodes.Count) notebook(s)" -ForegroundColor Green
    Write-Host ""

    if ($notebookNodes.Count -eq 0) {
        Write-Host "WARNING: No notebooks found" -ForegroundColor Yellow
        Write-Host "Please create a notebook in OneNote and try again" -ForegroundColor Yellow
        exit 0
    }

    # Iterate through notebooks
    foreach ($notebook in $notebookNodes) {
        Write-Host "Notebook: $($notebook.name)" -ForegroundColor Cyan
        Write-Host "  ID: $($notebook.ID)" -ForegroundColor DarkGray
        
        # Find sections within this notebook
        $sectionNodes = $notebook.SelectNodes(".//one:Section", $nsManager)
        Write-Host "  Sections: $($sectionNodes.Count)" -ForegroundColor White
        
        if ($sectionNodes.Count -gt 0) {
            foreach ($section in $sectionNodes) {
                Write-Host "    - Section: $($section.name)" -ForegroundColor Gray
                Write-Host "      ID: $($section.ID)" -ForegroundColor DarkGray
                
                # Find pages within this section
                $pageNodes = $section.SelectNodes(".//one:Page", $nsManager)
                Write-Host "      Pages: $($pageNodes.Count)" -ForegroundColor White
                
                if ($pageNodes.Count -gt 0) {
                    foreach ($page in $pageNodes) {
                        Write-Host "        * Page: $($page.name)" -ForegroundColor DarkCyan
                        Write-Host "          ID: $($page.ID)" -ForegroundColor DarkGray
                        if ($page.dateTime) {
                            Write-Host "          Date: $($page.dateTime)" -ForegroundColor DarkGray
                        }
                    }
                } else {
                    Write-Host "        (No pages in this section)" -ForegroundColor DarkGray
                }
                Write-Host ""
            }
        } else {
            Write-Host "    (No sections in this notebook)" -ForegroundColor DarkGray
        }
        Write-Host ""
    }

    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Test Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan

} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Stack trace:" -ForegroundColor DarkGray
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
    exit 1
}
