@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
echo Compiling repos.c...
cl /EHsc /O2 repos.c user32.lib ole32.lib oleaut32.lib dwmapi.lib psapi.lib shell32.lib shcore.lib /Fe:onenote-repos.exe
echo repos.c exit code: %ERRORLEVEL%

echo Compiling win-embed-overlay.c...
cl /O2 /EHsc win-embed-overlay.c user32.lib psapi.lib dwmapi.lib shcore.lib /Fe:win-embed-overlay.exe
echo win-embed-overlay.c exit code: %ERRORLEVEL%
