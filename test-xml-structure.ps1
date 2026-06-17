# Examine the XML structure
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Examining OneNote Hierarchy XML Structure" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$oneNote = New-Object -ComObject OneNote.Application

# Get hierarchy with level 1 (hsSections)
Write-Host "Getting hierarchy with level 1 (hsSections)..." -ForegroundColor Yellow
$xml = ""
$oneNote.GetHierarchy("", 1, [ref]$xml)

Write-Host "`nXML Length: $($xml.Length) characters" -ForegroundColor White
Write-Host "`nFirst 1000 characters:" -ForegroundColor Yellow
Write-Host $xml.Substring(0, [Math]::Min(1000, $xml.Length)) -ForegroundColor Gray

Write-Host "`n`nAttempting to parse XML..." -ForegroundColor Yellow
try {
    $xmlDoc = New-Object System.Xml.XmlDocument
    $xmlDoc.LoadXml($xml)
    Write-Host "  XML parsed successfully!" -ForegroundColor Green

    # Get root element
    Write-Host "`nRoot element: $($xmlDoc.DocumentElement.Name)" -ForegroundColor White

    # List all child nodes
    Write-Host "`nChild nodes of root:" -ForegroundColor White
    foreach ($child in $xmlDoc.DocumentElement.ChildNodes) {
        Write-Host "  - Node Type: $($child.NodeType), Name: $($child.Name)" -ForegroundColor DarkGray

        if ($child.Attributes) {
            Write-Host "    Attributes:" -ForegroundColor DarkGray
            foreach ($attr in $child.Attributes) {
                Write-Host "      $($attr.Name) = `"$($attr.Value)`"" -ForegroundColor DarkGray
            }
        }
    }

    # Try to find sections with different methods
    Write-Host "`nSearching for Section elements..." -ForegroundColor White

    # Method 1: With namespace
    $nsManager = New-Object System.Xml.XmlNamespaceManager($xmlDoc.NameTable)
    $nsManager.AddNamespace("one", "http://schemas.microsoft.com/office/onenote/2013/onenote")

    $sections1 = $xmlDoc.SelectNodes("//one:Section", $nsManager)
    Write-Host "  Method 1 (//one:Section): $($sections1.Count) found" -ForegroundColor Gray

    # Method 2: Without namespace
    $sections2 = $xmlDoc.SelectNodes("//Section")
    Write-Host "  Method 2 (//Section): $($sections2.Count) found" -ForegroundColor Gray

    # Method 3: Descendants
    $sections3 = $xmlDoc.SelectNodes("//descendant::*[local-name()='Section']")
    Write-Host "  Method 3 (descendant Section): $($sections3.Count) found" -ForegroundColor Gray

    if ($sections3.Count -gt 0) {
        Write-Host "`n  First section details:" -ForegroundColor Cyan
        $firstSec = $sections3[0]
        Write-Host "    Name: $($firstSec.GetAttribute('name'))" -ForegroundColor White
        Write-Host "    ID: $($firstSec.GetAttribute('ID'))" -ForegroundColor White
    }

} catch {
    Write-Host "  ERROR parsing XML: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Done!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
