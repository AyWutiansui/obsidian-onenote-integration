$one = New-Object -ComObject OneNote.Application

# Test page ID from the error log
$pageId = "{6CC78DF3-AE63-4718-9591-B98B93FE5829}{1}{E19501873536240997164520167714388821404758391}"

Write-Host "Testing NavigateTo with pageId: $pageId"

try {
    # Try calling NavigateTo with [ref] for the second parameter
    $xml = ""
    $one.NavigateTo($pageId, [ref]$xml)
    Write-Host "NavigateTo succeeded!"
} catch {
    Write-Host "NavigateTo failed: $_"
    Write-Host "Exception type: $($_.Exception.GetType().FullName)"
}
