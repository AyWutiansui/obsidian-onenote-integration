# Test getting sections for a specific notebook
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing Notebook Sections Retrieval" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$oneNote = New-Object -ComObject OneNote.Application

# Get first notebook
$xmlNotebooks = ""
$oneNote.GetHierarchy("", 1, [ref]$xmlNotebooks)

$xmlDoc = New-Object System.Xml.XmlDocument
$xmlDoc.LoadXml($xmlNotebooks)
$nsManager = New-Object System.Xml.XmlNamespaceManager($xmlDoc.NameTable)
$nsManager.AddNamespace("one", "http://schemas.microsoft.com/office/onenote/2013/onenote")

$firstNotebook = $xmlDoc.SelectSingleNode("//one:Notebook", $nsManager)
if (-not $firstNotebook) {
    Write-Host "ERROR: No notebooks found" -ForegroundColor Red
    exit 1
}

$notebookId = $firstNotebook.GetAttribute('ID')
$notebookName = $firstNotebook.GetAttribute('name')

Write-Host "Selected notebook:" -ForegroundColor White
Write-Host "  Name: $notebookName" -ForegroundColor Gray
Write-Host "  ID: $notebookId" -ForegroundColor Gray
Write-Host ""

# Now get sections for this notebook using level 1
Write-Host "[Test 1] GetHierarchy(notebookId, 1, ...) - hsSections" -ForegroundColor Yellow
try {
    $xmlSections = ""
    $oneNote.GetHierarchy($notebookId, 1, [ref]$xmlSections)

    Write-Host "  XML length: $($xmlSections.Length)" -ForegroundColor Green

    $secDoc = New-Object System.Xml.XmlDocument
    $secDoc.LoadXml($xmlSections)

    # Check root element
    Write-Host "  Root element: $($secDoc.DocumentElement.Name)" -ForegroundColor DarkGray

    # Find sections - they should be direct children
    $sections = $secDoc.SelectNodes("//one:Section", $nsManager)
    Write-Host "  Found $($sections.Count) section(s)" -ForegroundColor Green

    if ($sections.Count -gt 0) {
        Write-Host "`n  Sections list:" -ForegroundColor Cyan
        foreach ($sec in $sections) {
            $secName = $sec.GetAttribute('name')
            $secId = $sec.GetAttribute('ID')
            Write-Host "    - $secName" -ForegroundColor Gray
            Write-Host "      ID: $secId" -ForegroundColor DarkGray
        }

        # Try to get pages for first section
        $firstSection = $sections[0]
        $sectionId = $firstSection.GetAttribute('ID')
        $sectionName = $firstSection.GetAttribute('name')

        Write-Host "`n[Test 2] GetHierarchy(sectionId, 2, ...) - hsPages" -ForegroundColor Yellow
        Write-Host "  Section: $sectionName" -ForegroundColor White
        Write-Host "  Section ID: $sectionId" -ForegroundColor DarkGray

        try {
            $xmlPages = ""
            $oneNote.GetHierarchy($sectionId, 2, [ref]$xmlPages)

            Write-Host "  XML length: $($xmlPages.Length)" -ForegroundColor Green

            $pageDoc = New-Object System.Xml.XmlDocument
            $pageDoc.LoadXml($xmlPages)

            # Find pages
            $pages = $pageDoc.SelectNodes("//one:Page", $nsManager)
            Write-Host "  Found $($pages.Count) page(s)" -ForegroundColor Green

            if ($pages.Count -gt 0) {
                Write-Host "`n  Pages list:" -ForegroundColor Cyan
                foreach ($page in $pages) {
                    $pageTitle = $page.GetAttribute('name')
                    $pageId = $page.GetAttribute('ID')
                    Write-Host "    - $pageTitle" -ForegroundColor Gray
                }

                # Test page content
                $firstPage = $pages[0]
                $pageId = $firstPage.GetAttribute('ID')
                $pageTitle = $firstPage.GetAttribute('name')

                Write-Host "`n[Test 3] GetPageContent(pageId, ..., 7)" -ForegroundColor Yellow
                Write-Host "  Page: $pageTitle" -ForegroundColor White

                try {
                    $html = ""
                    $oneNote.GetPageContent($pageId, [ref]$html, 7)
                    Write-Host "  Content length: $($html.Length) chars" -ForegroundColor Green
                    if ($html.Length -gt 0) {
                        Write-Host "  Preview: $($html.Substring(0, [Math]::Min(100, $html.Length)))..." -ForegroundColor DarkGray
                    }
                } catch {
                    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
                }
            } else {
                Write-Host "  No pages found in this section" -ForegroundColor Yellow
                Write-Host "`n  Pages XML:" -ForegroundColor DarkGray
                Write-Host "  $xmlPages" -ForegroundColor DarkGray
            }
        } catch {
            Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "  Stack: $($_.ScriptStackTrace)" -ForegroundColor DarkGray
        }
    } else {
        Write-Host "  No sections found!" -ForegroundColor Red
        Write-Host "`n  Sections XML:" -ForegroundColor DarkGray
        Write-Host "  $xmlSections" -ForegroundColor DarkGray
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Stack trace: $($_.ScriptStackTrace)" -ForegroundColor DarkGray
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Test complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
