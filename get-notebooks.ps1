# Get OneNote Notebooks Script
# This script retrieves the list of notebooks from OneNote using COM API

try {
    Write-Host "Creating OneNote COM object..."
    $oneNote = New-Object -ComObject OneNote.Application
    Write-Host "COM object created successfully"

    Write-Host "Calling GetHierarchy..."
    $xml = ""
    $oneNote.GetHierarchy("", 0, [ref]$xml)

    if ([string]::IsNullOrEmpty($xml)) {
        Write-Host "ERROR: XML is empty"
        exit 1
    }

    Write-Host "XML length: $($xml.Length) characters"
    Write-Output $xml

} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    Write-Error $_.Exception.Message
    exit 1
}
