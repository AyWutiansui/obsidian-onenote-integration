# Test getting sections from a specific notebook
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing OneNote Sections Retrieval" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$oneNote = New-Object -ComObject OneNote.Application

# First, get all notebooks using level 1 (hsSections)
Write-Host "[Step 1] Getting notebooks using hsSections..." -ForegroundColor Yellow
$xml = ""
$oneNote.GetHierarchy("", 1, [ref]$xml)

if ([string]::IsNullOrEmpty($xml)) {
    Write-Host "ERROR: No notebooks found" -ForegroundColor Red
    exit 1
}

# Parse XML to find first notebook
$xmlDoc = New-Object System.Xml.XmlDocument
$xmlDoc.LoadXml($xml)
$nsManager = New-Object System.Xml.XmlNamespaceManager($xmlDoc.NameTable)
$nsManager.AddNamespace("one", "http://schemas.microsoft.com/office/onenote/2013/onenote")

$notebookNodes = $xmlDoc.SelectNodes("//one:Notebook", $nsManager)
Write-Host "Found $($notebookNodes.Count) notebook(s)" -ForegroundColor Green

if ($notebookNodes.Count -eq 0) {
    Write-Host "ERROR: No notebooks found" -ForegroundColor Red
    exit 1
}

# Get the first notebook
$firstNotebook = $notebookNodes[0]
$notebookId = $firstNotebook.ID
$notebookName = $firstNotebook.name

Write-Host "`nSelected notebook:" -ForegroundColor White
Write-Host "  Name: $notebookName" -ForegroundColor White
Write-Host "  ID: $notebookId" -ForegroundColor White
Write-Host ""

# Now try to get sections for this notebook
Write-Host "[Step 2] Getting sections for notebook '$notebookName'..." -ForegroundColor Yellow

# Method 1: Using notebook ID
Write-Host "`nMethod 1: Using notebook ID directly..." -ForegroundColor Yellow
$xmlSections = ""
try {
    $oneNote.GetHierarchy($notebookId, 1, [ref]$xmlSections)
    Write-Host "  GetHierarchy succeeded" -ForegroundColor Green
    Write-Host "  XML length: $($xmlSections.Length)" -ForegroundColor White

    if ($xmlSections.Length -gt 0) {
        # Parse sections
        $sectionsDoc = New-Object System.Xml.XmlDocument
        $sectionsDoc.LoadXml($xmlSections)

        $sectionNodes = $sectionsDoc.SelectNodes("//one:Section", $nsManager)
        Write-Host "  Found $($sectionNodes.Count) section(s)" -ForegroundColor Green

        if ($sectionNodes.Count -gt 0) {
            Write-Host "`n  Sections:" -ForegroundColor Cyan
            foreach ($section in $sectionNodes) {
                Write-Host "    - Name: $($section.name)" -ForegroundColor Gray
                Write-Host "      ID: $($section.ID)" -ForegroundColor DarkGray
            }
        } else {
            Write-Host "  No sections found in XML" -ForegroundColor Red
            Write-Host "`n  XML Preview:" -ForegroundColor Yellow
            Write-Host "  $xmlSections" -ForegroundColor DarkGray
        }
    } else {
        Write-Host "  ERROR: Empty XML returned" -ForegroundColor Red
    }
} catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

# Method 2: Using empty string with hierarchy level 1 and filtering by notebook
Write-Host "`nMethod 2: Using empty root with hsSections..." -ForegroundColor Yellow
$xmlAll = ""
try {
    $oneNote.GetHierarchy("", 1, [ref]$xmlAll)
    Write-Host "  GetHierarchy succeeded" -ForegroundColor Green
    Write-Host "  XML length: $($xmlAll.Length)" -ForegroundColor White

    $allDoc = New-Object System.Xml.XmlDocument
    $allDoc.LoadXml($xmlAll)

    # Find the specific notebook and its sections
    $targetNotebook = $allDoc.SelectSingleNode("//one:Notebook[@ID='$notebookId']", $nsManager)
    if ($targetNotebook) {
        $sectionsInNotebook = $targetNotebook.SelectNodes(".//one:Section", $nsManager)
        Write-Host "  Found $($sectionsInNotebook.Count) section(s) in notebook" -ForegroundColor Green

        if ($sectionsInNotebook.Count -gt 0) {
            Write-Host "`n  Sections:" -ForegroundColor Cyan
            foreach ($section in $sectionsInNotebook) {
                Write-Host "    - Name: $($section.name)" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "  ERROR: Notebook not found in hierarchy" -ForegroundColor Red
    }
} catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Test complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
