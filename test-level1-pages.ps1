# Check if level 1 hierarchy contains pages nested within sections
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Checking Level 1 Hierarchy for Nested Pages" -ForegroundColor Cyan
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

Write-Host "Testing notebook: $notebookName" -ForegroundColor White
Write-Host "ID: $notebookId" -ForegroundColor DarkGray
Write-Host ""

# Get sections for this notebook (level 1)
Write-Host "Getting hierarchy with level 1 for notebook..." -ForegroundColor Yellow
$xmlSec = ""
$oneNote.GetHierarchy($notebookId, 1, [ref]$xmlSec)

Write-Host "XML length: $($xmlSec.Length)" -ForegroundColor White
Write-Host "`nFirst 2000 chars:" -ForegroundColor Yellow
Write-Host $xmlSec.Substring(0, [Math]::Min(2000, $xmlSec.Length)) -ForegroundColor Gray

# Parse and look for Page elements
Write-Host "`n`nParsing XML..." -ForegroundColor Yellow
try {
    $secDoc = New-Object System.Xml.XmlDocument
    $secDoc.LoadXml($xmlSec)

    # Find all Sections
    $sections = $secDoc.SelectNodes("//one:Section", $nsManager)
    Write-Host "Found $($sections.Count) sections" -ForegroundColor Green

    # Check each section for nested pages
    Write-Host "`nChecking sections for pages..." -ForegroundColor Yellow
    foreach ($sec in $sections) {
        $secName = $sec.GetAttribute('name')
        $pages = $sec.SelectNodes(".//one:Page", $nsManager)

        Write-Host "  Section: $secName" -ForegroundColor Cyan
        Write-Host "    Pages found: $($pages.Count)" -ForegroundColor White

        if ($pages.Count -gt 0) {
            Write-Host "    First 3 pages:" -ForegroundColor DarkGray
            for ($i = 0; $i -lt [Math]::Min(3, $pages.Count); $i++) {
                Write-Host "      $($i+1). $($pages[$i].GetAttribute('name'))" -ForegroundColor Gray
            }
        }
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Done!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
