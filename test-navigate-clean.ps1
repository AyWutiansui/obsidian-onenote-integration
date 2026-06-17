$one = New-Object -ComObject OneNote.Application

# Original page ID from error log
$pageIdRaw = "{6CC78DF3-AE63-4718-9591-B98B93FE5829}{1}{E19501873536240997164520167714388821404758391}"

# Strip all whitespace (tabs, newlines, spaces)
$pageIdClean = $pageIdRaw -replace '\s+', ''

Write-Host "Original pageId length: $($pageIdRaw.Length)"
Write-Host "Cleaned pageId length: $($pageIdClean.Length)"
Write-Host "Are they different? $($pageIdRaw -ne $pageIdClean)"
Write-Host ""
Write-Host "Original (hex):"
for ($i = 0; $i -lt [Math]::Min(50, $pageIdRaw.Length); $i++) {
    Write-Host ("  [{0}] 0x{1:X2} '{2}'" -f $i, [int][char]$pageIdRaw[$i], 
        if ([char]::IsControl($pageIdRaw[$i])) { "(control)" } else { $pageIdRaw[$i] })
}

Write-Host ""
Write-Host "Testing NavigateTo with CLEANED pageId..."
try {
    $xml = ""
    $one.NavigateTo($pageIdClean, [ref]$xml)
    Write-Host "NavigateTo succeeded!"
} catch {
    Write-Host "NavigateTo failed: $_"
    Write-Host "HRESULT: 0x{0:X}" -f $_.Exception.InnerException.HResult
}

# Also try getting the hierarchy to see actual page IDs
Write-Host ""
Write-Host "=== Getting hierarchy to check page ID format ==="
$xml = ""
$one.GetHierarchy("", 4, [ref]$xml)
if ($xml) {
    # Parse first page ID from XML
    if ($xml -match '<one:Page[^>]*ID="([^"]+)"') {
        $actualPageId = $matches[1]
        Write-Host "First page ID from hierarchy: $actualPageId"
        Write-Host "Length: $($actualPageId.Length)"
        
        # Try navigating to this page
        Write-Host "Trying NavigateTo with actual page ID..."
        try {
            $xml2 = ""
            $one.NavigateTo($actualPageId, [ref]$xml2)
            Write-Host "NavigateTo with actual page ID succeeded!"
        } catch {
            Write-Host "NavigateTo with actual page ID failed: $_"
        }
    } else {
        Write-Host "Could not parse page ID from hierarchy XML"
        Write-Host "XML preview: $($xml.Substring(0, [Math]::Min(500, $xml.Length)))"
    }
}
