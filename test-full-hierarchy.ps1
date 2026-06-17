# Check if GetHierarchy("", 2) returns pages
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Checking GetHierarchy('', 2) for Pages" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$oneNote = New-Object -ComObject OneNote.Application

Write-Host "Getting full hierarchy with level 2 (hsPages)..." -ForegroundColor Yellow
$xml = ""
$oneNote.GetHierarchy("", 2, [ref]$xml)

Write-Host "XML length: $($xml.Length)" -ForegroundColor White

if ($xml.Length -lt 2000) {
    Write-Host "`nFull XML:" -ForegroundColor Yellow
    Write-Host $xml -ForegroundColor Gray
} else {
    Write-Host "`nFirst 2000 chars:" -ForegroundColor Yellow
    Write-Host $xml.Substring(0, [Math]::Min(2000, $xml.Length)) -ForegroundColor Gray
}

# Try to parse and find pages
Write-Host "`n`nParsing XML..." -ForegroundColor Yellow
try {
    $xmlDoc = New-Object System.Xml.XmlDocument
    $xmlDoc.LoadXml($xml)

    $nsManager = New-Object System.Xml.XmlNamespaceManager($xmlDoc.NameTable)
    $nsManager.AddNamespace("one", "http://schemas.microsoft.com/office/onenote/2013/onenote")

    # Count different element types
    $notebooks = $xmlDoc.SelectNodes("//one:Notebook", $nsManager)
    $sections = $xmlDoc.SelectNodes("//one:Section", $nsManager)
    $pages = $xmlDoc.SelectNodes("//one:Page", $nsManager)

    Write-Host "`nElement counts:" -ForegroundColor White
    Write-Host "  Notebooks: $($notebooks.Count)" -ForegroundColor Cyan
    Write-Host "  Sections: $($sections.Count)" -ForegroundColor Cyan
    Write-Host "  Pages: $($pages.Count)" -ForegroundColor Cyan

    if ($pages.Count -gt 0) {
        Write-Host "`nFirst 5 pages:" -ForegroundColor Yellow
        for ($i = 0; $i -lt [Math]::Min(5, $pages.Count); $i++) {
            $page = $pages[$i]
            Write-Host "  $($i+1). $($page.GetAttribute('name'))" -ForegroundColor Gray
            Write-Host "     ID: $($page.GetAttribute('ID'))" -ForegroundColor DarkGray
        }
    } else {
        Write-Host "`nWARNING: No pages found in hierarchy!" -ForegroundColor Red
        Write-Host "This means OneNote COM API may not return pages via GetHierarchy" -ForegroundColor Red
    }
} catch {
    Write-Host "ERROR parsing XML: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Done!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
