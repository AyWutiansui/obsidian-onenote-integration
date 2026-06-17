$one = New-Object -ComObject OneNote.Application

# The exact page ID from user's error log
$pageId = "{6CC78DF3-AE63-4718-9591-B98B93FE5829}{1}{E19501873536240997164520167714388821404758391}"

Write-Host "Getting URL for page: $pageId"

$url = ""
try {
    $one.GetHyperlinkToObject($pageId, "", [ref]$url)
    Write-Host "URL: $url"
    
    # Open with ShellExecute (same as what repos.c will do)
    Write-Host "Opening URL..."
    Start-Process $url
    Write-Host "Done - check if OneNote navigated to the correct page"
} catch {
    Write-Host "Failed: $_"
}
