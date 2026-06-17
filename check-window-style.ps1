Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    
    [DllImport("user32.dll")]
    public static extern IntPtr GetParent(IntPtr hWnd);
}
"@

# Find OneNote window
$hwnd = [Win32]::FindWindow("Framework::CFrame", $null)
if ($hwnd -eq [IntPtr]::Zero) {
    Write-Host "OneNote window not found"
    exit 1
}

Write-Host "OneNote HWND: $hwnd"
Write-Host "HWND (decimal): $([IntPtr]::ToInt64($hwnd))"

$GWL_STYLE = -16
$GWL_EXSTYLE = -20

$style = [Win32]::GetWindowLong($hwnd, $GWL_STYLE)
$exStyle = [Win32]::GetWindowLong($hwnd, $GWL_EXSTYLE)
$parent = [Win32]::GetParent($hwnd)

Write-Host ""
Write-Host "Style: 0x{0:X8}" -f $style
Write-Host "ExStyle: 0x{0:X8}" -f $exStyle
Write-Host "Parent: $parent"
Write-Host ""

# Decode style flags
Write-Host "Style flags:"
if ($style -band 0x80000000) { Write-Host "  WS_POPUP" }
if ($style -band 0x40000000) { Write-Host "  WS_CHILD" }
if ($style -band 0x00C00000) { Write-Host "  WS_CAPTION" }
if ($style -band 0x00800000) { Write-Host "  WS_BORDER" }
if ($style -band 0x00400000) { Write-Host "  WS_DLGFRAME" }
if ($style -band 0x00040000) { Write-Host "  WS_THICKFRAME" }
if ($style -band 0x00080000) { Write-Host "  WS_SYSMENU" }
if ($style -band 0x00020000) { Write-Host "  WS_MINIMIZEBOX" }
if ($style -band 0x00010000) { Write-Host "  WS_MAXIMIZEBOX" }
if ($style -band 0x10000000) { Write-Host "  WS_VISIBLE" }
if ($style -band 0x02000000) { Write-Host "  WS_CLIPSIBLINGS" }
if ($style -band 0x04000000) { Write-Host "  WS_CLIPCHILDREN" }
if ($style -band 0x00000001) { Write-Host "  WS_TILED" }

Write-Host ""
Write-Host "ExStyle flags:"
if ($exStyle -band 0x00000001) { Write-Host "  WS_EX_DLGMODALFRAME" }
if ($exStyle -band 0x00000004) { Write-Host "  WS_EX_NOPARENTNOTIFY" }
if ($exStyle -band 0x00000008) { Write-Host "  WS_EX_TOPMOST" }
if ($exStyle -band 0x00000010) { Write-Host "  WS_EX_ACCEPTFILES" }
if ($exStyle -band 0x00000020) { Write-Host "  WS_EX_TRANSPARENT" }
if ($exStyle -band 0x00000100) { Write-Host "  WS_EX_MDICHILD" }
if ($exStyle -band 0x00000200) { Write-Host "  WS_EX_TOOLWINDOW" }
if ($exStyle -band 0x00000400) { Write-Host "  WS_EX_WINDOWEDGE" }
if ($exStyle -band 0x00000800) { Write-Host "  WS_EX_CLIENTEDGE" }
if ($exStyle -band 0x00010000) { Write-Host "  WS_EX_CONTEXTHELP" }
if ($exStyle -band 0x00040000) { Write-Host "  WS_EX_RIGHT" }
if ($exStyle -band 0x00080000) { Write-Host "  WS_EX_RTLREADING" }
if ($exStyle -band 0x00100000) { Write-Host "  WS_EX_LEFTSCROLLBAR" }
if ($exStyle -band 0x00200000) { Write-Host "  WS_EX_CONTROLPARENT" }
if ($exStyle -band 0x00400000) { Write-Host "  WS_EX_STATICEDGE" }
if ($exStyle -band 0x00020000) { Write-Host "  WS_EX_APPWINDOW" }
if ($exStyle -band 0x00000080) { Write-Host "  WS_EX_LAYERED" }
if ($exStyle -band 0x00080000) { Write-Host "  WS_EX_NOINHERITLAYOUT" }
if ($exStyle -band 0x00200000) { Write-Host "  WS_EX_LAYOUTRTL" }
if ($exStyle -band 0x02000000) { Write-Host "  WS_EX_COMPOSITED" }
if ($exStyle -band 0x00000008) { Write-Host "  WS_EX_TOPMOST" }
if ($exStyle -band 0x00080000) { Write-Host "  WS_EX_NOACTIVATE" }
