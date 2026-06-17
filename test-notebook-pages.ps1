# Examine the full hierarchy with pages
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Examining Full Hierarchy with Pages" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$oneNote = New-Object -ComObject OneNote.Application

# Get first notebook
$xmlNb = ""
$oneNote.GetHierarchy("", 1, [ref]$xmlNb)
$xmlDoc = New-Object System.Xml.XmlDocument
$xmlDoc.LoadXml($xmlNb)
$nsManager = New-Object System.Xml.XmlNamespaceManager($xmlDoc.NameTable)
$nsManager.AddNamespace("one", "http://schemas.microsoft.com/office/onenote/2013/onenote")

$firstNotebook = $xmlDoc.SelectSingleNode("//one:Notebook", $nsManager)
$notebookId = $firstNotebook.GetAttribute('ID')
$notebookName = $firstNotebook.GetAttribute('name')

Write-Host "Notebook: $notebookName (ID: $notebookId)" -ForegroundColor White
Write-Host ""

# Get full hierarchy for this notebook with pages (level 2)
Write-Host "Getting hierarchy with level 2 (hsPages) for notebook..." -ForegroundColor Yellow
$xmlFull = ""
$oneNote.GetHierarchy($notebookId, 2, [ref]$xmlFull)

Write-Host "XML length: $($xmlFull.Length)" -ForegroundColor White
Write-Host "`nFull XML:" -ForegroundColor Yellow
Write-Host $xmlFull -ForegroundColor Gray

Write-Host "`n`nParsing XML..." -ForegroundColor Yellow
try {
    $fullDoc = New-Object System.Xml.XmlDocument
    $fullDoc.LoadXml($xmlFull)

    Write-Host "Root element: $($fullDoc.DocumentElement.Name)" -ForegroundColor White

    # Find all sections
    $sections = $fullDoc.SelectNodes("//one:Section", $nsManager)
    Write-Host "`nFound $($sections.Count) section(s)" -ForegroundColor Green

    foreach ($sec in $sections) {
        $secName = $sec.GetAttribute('name')
        $secId = $sec.GetAttribute('ID')

        # Find pages in this section
        $pages = $sec.SelectNodes(".//one:Page", $nsManager)
        Write-Host "`n  Section: $secName" -ForegroundColor Cyan
        Write-Host "    ID: $secId" -ForegroundColor DarkGray
        Write-Host "    Pages: $($pages.Count)" -ForegroundColor White

        if ($pages.Count -gt 0) {
            Write-Host "    Page list:" -ForegroundColor DarkGray
            foreach ($page in $pages) {
                $pageTitle = $page.GetAttribute('name')
                $pageId = $page.GetAttribute('ID')
                Write-Host "      - $pageTitle" -ForegroundColor Gray
                Write-Host "        ID: $pageId" -ForegroundColor DarkGray
            }
        }
    }
} catch {
    Write-Host "ERROR parsing XML: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Done!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
