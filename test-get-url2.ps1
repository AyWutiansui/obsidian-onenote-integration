$one = New-Object -ComObject OneNote.Application

# Get hierarchy to find a page with more details
$xml = ""
$one.GetHierarchy("", 4, [ref]$xml)

# Parse multiple pages and try GetHyperlinkToObject on each
$pageMatches = [regex]::Matches($xml, '<one:Page[^>]*ID="([^"]*)"[^>]*name="([^"]*)"')

Write-Host "Found $($pageMatches.Count) pages"
Write-Host ""

for ($i = 0; $i -lt [Math]::Min(3, $pageMatches.Count); $i++) {
    $match = $pageMatches[$i]
    $pageId = $match.Groups[1].Value
    $pageTitle = $match.Groups[2].Value
    
    Write-Host "Page $i : $pageTitle"
    Write-Host "  ID: $pageId"
    
    # Try GetHyperlinkToObject with empty objectID
    $url = ""
    try {
        $one.GetHyperlinkToObject($pageId, "", [ref]$url)
        Write-Host "  URL: $url"
    } catch {
        Write-Host "  URL: (failed)"
    }
    Write-Host ""
}
