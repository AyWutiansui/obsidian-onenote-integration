@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64 >nul 2>&1
if errorlevel 1 (
    echo ERROR: Failed to initialize Visual Studio build environment
    exit /b 1
)

echo Compiling onenote-repos.exe...
cl /O2 /Fe:"onenote-repos.exe" "repos.c" user32.lib ole32.lib oleaut32.lib shell32.lib /nologo
if errorlevel 1 (
    echo ERROR: Failed to compile repos.c
    exit /b 1
)

echo Compiling win-embed-overlay.exe...
cl /O2 /Fe:"win-embed-overlay.exe" "win-embed-overlay.c" user32.lib psapi.lib dwmapi.lib /nologo
if errorlevel 1 (
    echo ERROR: Failed to compile win-embed-overlay.c
    exit /b 1
)

echo Build complete: onenote-repos.exe, win-embed-overlay.exe
