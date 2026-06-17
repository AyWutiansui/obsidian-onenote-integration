$one = New-Object -ComObject OneNote.Application
Write-Host "=== OneNote COM Methods ==="
$one | Get-Member -MemberType Method | Select-Object Name | Format-Table -AutoSize
