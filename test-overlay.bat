@echo off
echo ========================================
echo Test Overlay Version (with style fix)
echo ========================================
echo.
echo This version adds WS_CHILD before SetParent
echo as required by Windows API documentation.
echo.
echo Steps:
echo 1. Close Obsidian completely
echo 2. Run this script
echo 3. Restart Obsidian and test embedding
echo.
echo Press any key to continue (or Ctrl+C to cancel)...
pause >nul

echo.
echo Killing Obsidian...
taskkill /F /IM Obsidian.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo Copying new version...
copy /Y "win-embed-overlay-test.exe" "..\test-vault\.obsidian\plugins\obsidian-onenote-integration\win-embed-overlay.exe"
if errorlevel 1 (
    echo ERROR: Failed to copy
    pause
    exit /b 1
)

echo.
echo SUCCESS! File updated.
echo.
echo Starting Obsidian...
start "" "Obsidian.exe"

echo.
echo Please test the OneNote embed feature.
echo Check console for detailed REPARENT logs.
pause
