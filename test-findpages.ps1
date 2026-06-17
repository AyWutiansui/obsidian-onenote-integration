# Test if OneNote COM has FindPages or other methods to get pages
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Exploring OneNote COM API Methods" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$oneNote = New-Object -ComObject OneNote.Application

Write-Host "Available methods on OneNote.Application object:" -ForegroundColor Yellow
$methods = $oneNote | Get-Member -MemberType Method | Select-Object -ExpandProperty Name

foreach ($method in $methods) {
    Write-Host "  - $method" -ForegroundColor Gray
}

Write-Host "`n`nLooking for page-related methods..." -ForegroundColor Yellow
$pageMethods = $methods | Where-Object { $_ -imatch "page|find|search" }

if ($pageMethods.Count -gt 0) {
    Write-Host "Found page-related methods:" -ForegroundColor Green
    foreach ($method in $pageMethods) {
        Write-Host "  - $method" -ForegroundColor White
    }
} else {
    Write-Host "No page-related methods found" -ForegroundColor Red
}

Write-Host "`n`nChecking if OpenApplication or NavigateTo methods exist..." -ForegroundColor Yellow
if ($methods -contains "OpenApplication") {
    Write-Host "  OpenApplication: YES" -ForegroundColor Green
} else {
    Write-Host "  OpenApplication: NO" -ForegroundColor Red
}

if ($methods -contains "NavigateTo") {
    Write-Host "  NavigateTo: YES" -ForegroundColor Green
} else {
    Write-Host "  NavigateTo: NO" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Done!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
