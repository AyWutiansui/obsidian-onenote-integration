# Test different GetHierarchy calls
Write-Host "Testing different hierarchy levels..." -ForegroundColor Cyan

$oneNote = New-Object -ComObject OneNote.Application

# Level 0: hsNotebooks
Write-Host "`n[Level 0] hsNotebooks (notebooks)..." -ForegroundColor Yellow
$xml0 = ""
$oneNote.GetHierarchy("", 0, [ref]$xml0)
Write-Host "  Length: $($xml0.Length)" -ForegroundColor White
if ($xml0.Length -gt 0) {
    Write-Host "  Content: $xml0" -ForegroundColor Gray
}

# Level 1: hsSections
Write-Host "`n[Level 1] hsSections (sections)..." -ForegroundColor Yellow
$xml1 = ""
$oneNote.GetHierarchy("", 1, [ref]$xml1)
Write-Host "  Length: $($xml1.Length)" -ForegroundColor White
if ($xml1.Length -gt 0) {
    Write-Host "  Preview: $($xml1.Substring(0, [Math]::Min(500, $xml1.Length)))" -ForegroundColor Gray
}

# Level 2: hsPages
Write-Host "`n[Level 2] hsPages (pages)..." -ForegroundColor Yellow
$xml2 = ""
$oneNote.GetHierarchy("", 2, [ref]$xml2)
Write-Host "  Length: $($xml2.Length)" -ForegroundColor White
if ($xml2.Length -gt 0) {
    Write-Host "  Preview: $($xml2.Substring(0, [Math]::Min(500, $xml2.Length)))" -ForegroundColor Gray
}

# Try with specific object ID (root)
Write-Host "`n[Try with root ID] Getting notebooks with root ID..." -ForegroundColor Yellow
try {
    # First get the root
    $xmlRoot = ""
    $oneNote.GetHierarchy("", 0, [ref]$xmlRoot)
    Write-Host "  Root XML: $xmlRoot" -ForegroundColor Gray

    # Parse to find root ID if available
    $xmlDoc = New-Object System.Xml.XmlDocument
    $xmlDoc.LoadXml($xmlRoot)
    $nsManager = New-Object System.Xml.XmlNamespaceManager($xmlDoc.NameTable)
    $nsManager.AddNamespace("one", "http://schemas.microsoft.com/office/onenote/2013/onenote")

    # Check for Notebook elements
    $notebookNodes = $xmlDoc.SelectNodes("//one:Notebook", $nsManager)
    Write-Host "  Found $($notebookNodes.Count) notebook nodes" -ForegroundColor White

    foreach ($nb in $notebookNodes) {
        Write-Host "    - Name: $($nb.name), ID: $($nb.ID)" -ForegroundColor Green
    }
} catch {
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nDone!" -ForegroundColor Cyan
