# Test correct way to get pages
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing Correct Page Retrieval Methods" -ForegroundColor Cyan
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

# Get sections for this notebook
$xmlSec = ""
$oneNote.GetHierarchy($notebookId, 1, [ref]$xmlSec)
$secDoc = New-Object System.Xml.XmlDocument
$secDoc.LoadXml($xmlSec)
$firstSection = $secDoc.SelectSingleNode("//one:Section", $nsManager)
$sectionId = $firstSection.GetAttribute('ID')
$sectionName = $firstSection.GetAttribute('name')

Write-Host "Notebook: $notebookName" -ForegroundColor White
Write-Host "Section: $sectionName (ID: $sectionId)" -ForegroundColor White
Write-Host ""

# Method 1: GetHierarchy with empty string and level 2
Write-Host "[Method 1] GetHierarchy('', 2, ...) - all pages" -ForegroundColor Yellow
try {
    $xml1 = ""
    $oneNote.GetHierarchy("", 2, [ref]$xml1)

    Write-Host "  Success! XML length: $($xml1.Length)" -ForegroundColor Green

    $doc1 = New-Object System.Xml.XmlDocument
    $doc1.LoadXml($xml1)

    # Find our section
    $targetSection = $doc1.SelectSingleNode("//*[@ID='$sectionId']", $null)
    if ($targetSection) {
        $pages = $targetSection.SelectNodes(".//one:Page", $nsManager)
        Write-Host "  Found $($pages.Count) page(s) in section" -ForegroundColor Green

        if ($pages.Count -gt 0) {
            Write-Host "  Pages:" -ForegroundColor Cyan
            foreach ($p in $pages) {
                Write-Host "    - $($p.GetAttribute('name'))" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "  Section not found in hierarchy" -ForegroundColor Red
    }
} catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Method 2: GetHierarchy with notebook ID and level 2
Write-Host "[Method 2] GetHierarchy(notebookId, 2, ...) - pages from notebook" -ForegroundColor Yellow
try {
    $xml2 = ""
    $oneNote.GetHierarchy($notebookId, 2, [ref]$xml2)

    Write-Host "  Success! XML length: $($xml2.Length)" -ForegroundColor Green

    $doc2 = New-Object System.Xml.XmlDocument
    $doc2.LoadXml($xml2)

    # Find our section
    $targetSection = $doc2.SelectSingleNode("//*[@ID='$sectionId']", $null)
    if ($targetSection) {
        $pages = $targetSection.SelectNodes(".//one:Page", $nsManager)
        Write-Host "  Found $($pages.Count) page(s) in section" -ForegroundColor Green

        if ($pages.Count -gt 0) {
            Write-Host "  Pages:" -ForegroundColor Cyan
            foreach ($p in $pages) {
                Write-Host "    - $($p.GetAttribute('name'))" -ForegroundColor Gray
            }

            # Test getting content
            $firstPage = $pages[0]
            Write-Host "`n  Testing GetPageContent..." -ForegroundColor Yellow
            try {
                $html = ""
                $oneNote.GetPageContent($firstPage.GetAttribute('ID'), [ref]$html, 7)
                Write-Host "    Content length: $($html.Length) chars" -ForegroundColor Green
            } catch {
                Write-Host "    ERROR: $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "  Section not found" -ForegroundColor Red
    }
} catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Method 3: Use the section's parent object ID
Write-Host "[Method 3] Try using section ID with different approaches" -ForegroundColor Yellow

# 3a: Get full hierarchy and filter
Write-Host "  3a: Get all (level 2) and find section by ID..." -ForegroundColor DarkGray
try {
    $xmlAll = ""
    $oneNote.GetHierarchy("", 2, [ref]$xmlAll)

    $allDoc = New-Object System.Xml.XmlDocument
    $allDoc.LoadXml($xmlAll)

    # Search for section with matching ID
    $sectionNode = $allDoc.SelectSingleNode("//*[@ID='$sectionId']", $null)
    if ($sectionNode) {
        $pages = $sectionNode.SelectNodes(".//one:Page", $nsManager)
        Write-Host "    Found $($pages.Count) page(s)" -ForegroundColor Green
        if ($pages.Count -gt 0) {
            Write-Host "    First page: $($pages[0].GetAttribute('name'))" -ForegroundColor Gray
        }
    } else {
        Write-Host "    Section not found in full hierarchy" -ForegroundColor Red
    }
} catch {
    Write-Host "    ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Test complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
