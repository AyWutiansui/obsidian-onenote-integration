# Test FindPages method
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing FindPages Method" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$oneNote = New-Object -ComObject OneNote.Application

# Get first notebook and section
$xmlNb = ""
$oneNote.GetHierarchy("", 1, [ref]$xmlNb)
$xmlDoc = New-Object System.Xml.XmlDocument
$xmlDoc.LoadXml($xmlNb)
$nsManager = New-Object System.Xml.XmlNamespaceManager($xmlDoc.NameTable)
$nsManager.AddNamespace("one", "http://schemas.microsoft.com/office/onenote/2013/onenote")

$firstNotebook = $xmlDoc.SelectSingleNode("//one:Notebook", $nsManager)
$notebookId = $firstNotebook.GetAttribute('ID')
$notebookName = $firstNotebook.GetAttribute('name')

# Get first section
$xmlSec = ""
$oneNote.GetHierarchy($notebookId, 1, [ref]$xmlSec)
$secDoc = New-Object System.Xml.XmlDocument
$secDoc.LoadXml($xmlSec)
$firstSection = $secDoc.SelectSingleNode("//one:Section", $nsManager)
$sectionId = $firstSection.GetAttribute('ID')
$sectionName = $firstSection.GetAttribute('name')
$sectionPath = $firstSection.GetAttribute('path')

Write-Host "Notebook: $notebookName" -ForegroundColor White
Write-Host "Section: $sectionName" -ForegroundColor White
Write-Host "Section ID: $sectionId" -ForegroundColor DarkGray
Write-Host "Section Path: $sectionPath" -ForegroundColor DarkGray
Write-Host ""

# Test FindPages with empty search string (should return all pages)
Write-Host "[Test] FindPages('', sectionPath, ...) - find all pages" -ForegroundColor Yellow
try {
    $xmlPages = ""
    # FindPages parameters: bstrSearchString, bstrScope, pbstrHierarchyXMLOut
    # Try using section path as scope
    $oneNote.FindPages("", $sectionPath, [ref]$xmlPages)

    Write-Host "  FindPages succeeded!" -ForegroundColor Green
    Write-Host "  XML length: $($xmlPages.Length)" -ForegroundColor White

    if ($xmlPages.Length -gt 0) {
        Write-Host "`n  First 1000 chars:" -ForegroundColor Yellow
        Write-Host "  $xmlPages".Substring(0, [Math]::Min(1000, $xmlPages.Length)) -ForegroundColor Gray

        # Parse pages
        $pageDoc = New-Object System.Xml.XmlDocument
        $pageDoc.LoadXml($xmlPages)

        $pages = $pageDoc.SelectNodes("//one:Page", $nsManager)
        Write-Host "`n  Found $($pages.Count) page(s)" -ForegroundColor Green

        if ($pages.Count -gt 0) {
            Write-Host "`n  Pages list:" -ForegroundColor Cyan
            foreach ($page in $pages) {
                Write-Host "    - $($page.GetAttribute('name'))" -ForegroundColor Gray
                Write-Host "      ID: $($page.GetAttribute('ID'))" -ForegroundColor DarkGray
            }
        }
    } else {
        Write-Host "  No pages found (empty XML)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  This method may not work as expected" -ForegroundColor DarkGray
}

Write-Host "`n[Test 2] Try FindPages with different parameters..." -ForegroundColor Yellow
try {
    $xmlPages2 = ""
    # Try with just the search string
    $oneNote.FindPages("", "", [ref]$xmlPages2)

    Write-Host "  XML length: $($xmlPages2.Length)" -ForegroundColor White

    if ($xmlPages2.Length -gt 0) {
        $pageDoc2 = New-Object System.Xml.XmlDocument
        if ($xmlPages2 -match "<one:") {
            $pageDoc2.LoadXml($xmlPages2)
            $pages2 = $pageDoc2.SelectNodes("//one:Page", $nsManager)
            Write-Host "  Found $($pages2.Count) page(s) globally" -ForegroundColor Green
        } else {
            Write-Host "  XML doesn't contain page data" -ForegroundColor Yellow
            Write-Host "  Preview: $($xmlPages2.Substring(0, [Math]::Min(200, $xmlPages2.Length)))" -ForegroundColor DarkGray
        }
    }
} catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Done!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
