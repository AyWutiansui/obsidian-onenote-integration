@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
cl /O2 /Fe:"D:\ObsidianPlugin\obsidian-onenote-integration\onenote-repos.exe" "D:\ObsidianPlugin\obsidian-onenote-integration\repos.c" user32.lib ole32.lib oleaut32.lib dwmapi.lib psapi.lib shell32.lib /nologo
