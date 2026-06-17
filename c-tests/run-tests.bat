@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64 >nul 2>&1

echo === Compiling win-embed.exe ===
cl /O2 /Fe:"..\win-embed.exe" "..\win-embed.c" user32.lib psapi.lib dwmapi.lib /nologo
if %ERRORLEVEL% NEQ 0 (
    echo FAILED: win-embed.exe compilation failed
    exit /b 1
)
echo OK: win-embed.exe compiled

echo.
echo === Compiling onenote-repos.exe ===
cl /O2 /Fe:"..\onenote-repos.exe" "..\repos.c" user32.lib ole32.lib oleaut32.lib /nologo
if %ERRORLEVEL% NEQ 0 (
    echo FAILED: onenote-repos.exe compilation failed
    exit /b 1
)
echo OK: onenote-repos.exe compiled

echo.
echo === Compiling win-embed-test.exe ===
cl /O2 /DWIN_EMBED_TEST /Fe:"win-embed-test.exe" "win-embed-test.c" user32.lib psapi.lib dwmapi.lib /nologo /I:".."
if %ERRORLEVEL% NEQ 0 (
    echo FAILED: win-embed-test.exe compilation failed
    exit /b 1
)
echo OK: win-embed-test.exe compiled

echo.
echo === Running tests ===
win-embed-test.exe
if %ERRORLEVEL% NEQ 0 (
    echo FAILED: tests failed
    exit /b 1
)

echo.
echo === All done ===
