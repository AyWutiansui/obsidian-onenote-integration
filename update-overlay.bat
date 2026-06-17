@echo off
echo ========================================
echo Update win-embed-overlay.exe
echo ========================================
echo.
echo This script will:
echo 1. Kill all Obsidian processes
echo 2. Replace win-embed-overlay.exe
echo 3. Restart Obsidian
echo.
echo Press Ctrl+C to cancel, or any key to continue...
pause >nul

echo.
echo [1/3] Killing Obsidian processes...
taskkill /F /IM Obsidian.exe 2>nul
if errorlevel 1 (
    echo No Obsidian processes found
) else (
    echo Obsidian processes killed
)

echo.
echo [2/3] Waiting for processes to exit...
timeout /t 2 /nobreak >nul

echo.
echo [3/3] Copying new version...
copy /Y "D:\ObsidianPlugin\obsidian-onenote-integration\win-embed-overlay.exe" "D:\ObsidianPlugin\test-vault\.obsidian\plugins\obsidian-onenote-integration\win-embed-overlay.exe"
if errorlevel 1 (
    echo ERROR: Failed to copy file
    pause
    exit /b 1
) else (
    echo SUCCESS: File updated
)

echo.
echo Starting Obsidian...
start "" "Obsidian.exe"

echo.
echo Done! You can now test the overlay version.
echo See TESTING.md for testing instructions.
pause
