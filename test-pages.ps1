# Test getting pages from a specific section
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing OneNote Pages Retrieval" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$oneNote = New-Object -ComObject OneNote.Application

# First, get all notebooks and sections
Write-Host "[Step 1] Getting first notebook and section..." -ForegroundColor Yellow
$xml = ""
$oneNote.GetHierarchy("", 1, [ref]$xml)

$xmlDoc = New-Object System.Xml.XmlDocument
$xmlDoc.LoadXml($xml)
$nsManager = New-Object System.Xml.XmlNamespaceManager($xmlDoc.NameTable)
$nsManager.AddNamespace("one", "http://schemas.microsoft.com/office/onenote/2013/onenote")

$notebookNodes = $xmlDoc.SelectNodes("//one:Notebook", $nsManager)
if ($notebookNodes.Count -eq 0) {
    Write-Host "ERROR: No notebooks found" -ForegroundColor Red
    exit 1
}

$firstNotebook = $notebookNodes[0]
$notebookId = $firstNotebook.ID
Write-Host "Notebook: $($firstNotebook.name)" -ForegroundColor White

# Get sections for this notebook
Write-Host "`n[Step 2] Getting sections..." -ForegroundColor Yellow
$xmlSections = ""
$oneNote.GetHierarchy($notebookId, 1, [ref]$xmlSections)

$sectionsDoc = New-Object System.Xml.XmlDocument
$sectionsDoc.LoadXml($xmlSections)
$sectionNodes = $sectionsDoc.SelectNodes("//one:Section", $nsManager)

if ($sectionNodes.Count -eq 0) {
    Write-Host "ERROR: No sections found" -ForegroundColor Red
    exit 1
}

$firstSection = $sectionNodes[0]
$sectionId = $firstSection.ID
Write-Host "Section: $($firstSection.name)" -ForegroundColor White
Write-Host "Section ID: $sectionId" -ForegroundColor DarkGray

# Now get pages for this section
Write-Host "`n[Step 3] Getting pages for section '$($firstSection.name)'..." -ForegroundColor Yellow

try {
    $xmlPages = ""
    $oneNote.GetHierarchy($sectionId, 2, [ref]$xmlPages)

    Write-Host "GetHierarchy succeeded" -ForegroundColor Green
    Write-Host "XML length: $($xmlPages.Length)" -ForegroundColor White

    if ($xmlPages.Length -gt 0) {
        # Parse pages
        $pagesDoc = New-Object System.Xml.XmlDocument
        $pagesDoc.LoadXml($xmlPages)

        $pageNodes = $pagesDoc.SelectNodes("//one:Page", $nsManager)
        Write-Host "Found $($pageNodes.Count) page(s)" -ForegroundColor Green

        if ($pageNodes.Count -gt 0) {
            Write-Host "`nPages:" -ForegroundColor Cyan
            foreach ($page in $pageNodes) {
                Write-Host "  - Title: $($page.name)" -ForegroundColor Gray
                Write-Host "    ID: $($page.ID)" -ForegroundColor DarkGray
                if ($page.dateTime) {
                    Write-Host "    Date: $($page.dateTime)" -ForegroundColor DarkGray
                }
                Write-Host ""
            }

            # Test getting page content for first page
            $firstPage = $pageNodes[0]
            $pageId = $firstPage.ID
            Write-Host "`n[Step 4] Testing page content retrieval..." -ForegroundColor Yellow
            Write-Host "Page: $($firstPage.name)" -ForegroundColor White

            try {
                $html = ""
                $oneNote.GetPageContent($pageId, [ref]$html, 7)

                if ($html.Length -gt 0) {
                    Write-Host "Page content retrieved successfully!" -ForegroundColor Green
                    Write-Host "Content length: $($html.Length) characters" -ForegroundColor White
                    Write-Host "Preview (first 200 chars):" -ForegroundColor DarkGray
                    Write-Host "  $($html.Substring(0, [Math]::Min(200, $html.Length)))" -ForegroundColor DarkGray
                } else {
                    Write-Host "WARNING: Empty page content" -ForegroundColor Yellow
                }
            } catch {
                Write-Host "ERROR getting page content: $($_.Exception.Message)" -ForegroundColor Red
            }
        } else {
            Write-Host "No pages found in this section" -ForegroundColor Yellow
            Write-Host "`nXML Preview:" -ForegroundColor DarkGray
            Write-Host "$xmlPages" -ForegroundColor DarkGray
        }
    } else {
        Write-Host "ERROR: Empty XML returned from GetHierarchy" -ForegroundColor Red
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Stack trace:" -ForegroundColor DarkGray
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Test complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
