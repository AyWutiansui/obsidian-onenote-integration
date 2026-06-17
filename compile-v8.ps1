# Compile win-embed-final-v3.c into win-embed-v8.exe
$vcvarsPath = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
$sourceFile = "D:\ObsidianPlugin\obsidian-onenote-integration\win-embed-final-v3.c"
$outputExe = "D:\ObsidianPlugin\obsidian-onenote-integration\win-embed-v8.exe"

# Use cmd to run vcvarsall and then compile
cmd /c "`"$vcvarsPath`" x64 && cd /d `"$($sourceFile | Split-Path -Parent)`" && cl /EHsc /O2 `"$($sourceFile | Split-Path -Leaf)`" user32.lib ole32.lib oleaut32.lib dwmapi.lib psapi.lib shell32.lib shcore.lib /Fe:`"$outputExe`""

if ($LASTEXITCODE -eq 0) {
    Write-Host "Compilation successful: $outputExe"
} else {
    Write-Host "Compilation failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
