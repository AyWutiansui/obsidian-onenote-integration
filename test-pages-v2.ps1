# Test different approaches to get pages
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing Different Page Retrieval Methods" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$oneNote = New-Object -ComObject OneNote.Application

# Get full hierarchy first
Write-Host "[Step 1] Getting full hierarchy with sections..." -ForegroundColor Yellow
$xmlFull = ""
$oneNote.GetHierarchy("", 1, [ref]$xmlFull)

$xmlDoc = New-Object System.Xml.XmlDocument
$xmlDoc.LoadXml($xmlFull)
$nsManager = New-Object System.Xml.XmlNamespaceManager($xmlDoc.NameTable)
$nsManager.AddNamespace("one", "http://schemas.microsoft.com/office/onenote/2013/onenote")

$sectionNodes = $xmlDoc.SelectNodes("//one:Section", $nsManager)
if ($sectionNodes.Count -eq 0) {
    Write-Host "ERROR: No sections found" -ForegroundColor Red
    exit 1
}

$firstSection = $sectionNodes[0]
$sectionId = $firstSection.ID
$sectionName = $firstSection.name

Write-Host "Testing with section: $sectionName" -ForegroundColor White
Write-Host "Section ID: $sectionId" -ForegroundColor DarkGray
Write-Host ""

# Method 1: GetHierarchy with section ID and hsPages (level 2)
Write-Host "[Method 1] GetHierarchy(sectionId, 2, ...) - hsPages" -ForegroundColor Yellow
try {
    $xml1 = ""
    $oneNote.GetHierarchy($sectionId, 2, [ref]$xml1)
    Write-Host "  Success! XML length: $($xml1.Length)" -ForegroundColor Green

    if ($xml1.Length -gt 0) {
        $doc1 = New-Object System.Xml.XmlDocument
        $doc1.LoadXml($xml1)
        $pages1 = $doc1.SelectNodes("//one:Page", $nsManager)
        Write-Host "  Found $($pages1.Count) page(s)" -ForegroundColor Green

        if ($pages1.Count -gt 0) {
            Write-Host "  Pages:" -ForegroundColor Cyan
            foreach ($p in $pages1) {
                Write-Host "    - $($p.name)" -ForegroundColor Gray
            }
        }
    }
} catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Method 2: GetHierarchy with empty string and hsPages (level 2)
Write-Host "[Method 2] GetHierarchy('', 2, ...) - all pages" -ForegroundColor Yellow
try {
    $xml2 = ""
    $oneNote.GetHierarchy("", 2, [ref]$xml2)
    Write-Host "  Success! XML length: $($xml2.Length)" -ForegroundColor Green

    if ($xml2.Length -gt 0) {
        $doc2 = New-Object System.Xml.XmlDocument
        $doc2.LoadXml($xml2)

        # Find pages in our specific section
        $targetSection = $doc2.SelectSingleNode("//one:Section[@ID='$sectionId']", $nsManager)
        if ($targetSection) {
            $pagesInTarget = $targetSection.SelectNodes(".//one:Page", $nsManager)
            Write-Host "  Found $($pagesInTarget.Count) page(s) in target section" -ForegroundColor Green

            if ($pagesInTarget.Count -gt 0) {
                Write-Host "  Pages:" -ForegroundColor Cyan
                foreach ($p in $pagesInTarget) {
                    Write-Host "    - $($p.name)" -ForegroundColor Gray
                }
            }
        } else {
            Write-Host "  Section not found in hierarchy" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Method 3: GetHierarchy with notebook ID and hsPages
Write-Host "[Method 3] GetHierarchy(notebookId, 2, ...) - pages from notebook" -ForegroundColor Yellow
$notebookNode = $xmlDoc.SelectSingleNode("//one:Notebook", $nsManager)
if ($notebookNode) {
    $notebookId = $notebookNode.ID
    try {
        $xml3 = ""
        $oneNote.GetHierarchy($notebookId, 2, [ref]$xml3)
        Write-Host "  Success! XML length: $($xml3.Length)" -ForegroundColor Green

        if ($xml3.Length -gt 0) {
            $doc3 = New-Object System.Xml.XmlDocument
            $doc3.LoadXml($xml3)

            # Find our specific section
            $targetSec = $doc3.SelectSingleNode("//one:Section[@ID='$sectionId']", $nsManager)
            if ($targetSec) {
                $pagesInSec = $targetSec.SelectNodes(".//one:Page", $nsManager)
                Write-Host "  Found $($pagesInSec.Count) page(s) in target section" -ForegroundColor Green

                if ($pagesInSec.Count -gt 0) {
                    Write-Host "  Pages:" -ForegroundColor Cyan
                    foreach ($p in $pagesInSec) {
                        Write-Host "    - $($p.name)" -ForegroundColor Gray
                    }

                    # Try to get content of first page
                    $firstPage = $pagesInSec[0]
                    Write-Host "`n  Testing GetPageContent for '$($firstPage.name)'..." -ForegroundColor Yellow
                    try {
                        $html = ""
                        $oneNote.GetPageContent($firstPage.ID, [ref]$html, 7)
                        Write-Host "    Content length: $($html.Length) chars" -ForegroundColor Green
                    } catch {
                        Write-Host "    ERROR: $($_.Exception.Message)" -ForegroundColor Red
                    }
                }
            }
        }
    } catch {
        Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Test complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
