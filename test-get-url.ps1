$one = New-Object -ComObject OneNote.Application

# Get hierarchy to find a page
$xml = ""
$one.GetHierarchy("", 4, [ref]$xml)

if ($xml -match 'ID="([^"]+)"') {
    $pageId = $matches[1]
    Write-Host "Page ID: $pageId"
    
    # Try GetHyperlinkToObject
    $url = ""
    try {
        $one.GetHyperlinkToObject($pageId, "", [ref]$url)
        Write-Host "URL from GetHyperlinkToObject: $url"
        
        # Try opening it
        Write-Host "Opening URL..."
        Start-Process $url
        Write-Host "Done"
    } catch {
        Write-Host "GetHyperlinkToObject failed: $_"
    }
} else {
    Write-Host "No page ID found"
}
