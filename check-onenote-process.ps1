Get-Process | Where-Object { $_.ProcessName -match 'ONENOTE' } | Format-Table ProcessName,Id,MainWindowTitle -AutoSize
