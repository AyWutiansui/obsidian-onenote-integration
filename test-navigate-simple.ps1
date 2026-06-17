$one = New-Object -ComObject OneNote.Application

# Original page ID from error log
$pageIdRaw = "{6CC78DF3-AE63-4718-9591-B98B93FE5829}{1}{E19501873536240997164520167714388821404758391}"

# Strip all whitespace
$pageIdClean = $pageIdRaw -replace '\s+', ''

Write-Host "Original length: $($pageIdRaw.Length)"
Write-Host "Cleaned length: $($pageIdClean.Length)"
Write-Host ""

# Get hierarchy to see actual page IDs
Write-Host "=== Getting hierarchy ==="
$xml = ""
$one.GetHierarchy("", 4, [ref]$xml)
if ($xml) {
    Write-Host "Got hierarchy XML, length: $($xml.Length)"
    
    # Try to extract first page ID
    if ($xml -match 'ID="([^"]+)"') {
        $actualPageId = $matches[1]
        Write-Host "First page ID found: $actualPageId"
        Write-Host "Length: $($actualPageId.Length)"
        
        # Clean it too
        $actualPageIdClean = $actualPageId -replace '\s+', ''
        Write-Host "Cleaned: $actualPageIdClean"
        Write-Host ""
        
        # Try navigating
        Write-Host "Trying NavigateTo..."
        try {
            $xml2 = ""
            $one.NavigateTo($actualPageIdClean, [ref]$xml2)
            Write-Host "SUCCESS!"
        } catch {
            Write-Host "FAILED: $_"
            if ($_.Exception.InnerException) {
                Write-Host "HRESULT: 0x{0:X8}" -f $_.Exception.InnerException.HResult
            }
        }
    } else {
        Write-Host "No page ID found in XML"
    }
} else {
    Write-Host "Failed to get hierarchy"
}
