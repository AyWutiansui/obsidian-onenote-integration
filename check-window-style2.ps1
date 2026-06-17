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
    
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
}
"@

# Try multiple class names
$hwnd = [Win32]::FindWindow("Framework::CFrame", $null)
if ($hwnd -eq [IntPtr]::Zero) {
    $hwnd = [Win32]::FindWindow("ApplicationFrameWindow", $null)
}
if ($hwnd -eq [IntPtr]::Zero) {
    Write-Host "OneNote window not found with any class name"
    exit 1
}

Write-Host "OneNote HWND: $([IntPtr]::ToInt64($hwnd))"
Write-Host "Is visible: $([Win32]::IsWindowVisible($hwnd))"

# Make sure it's visible
[Win32]::ShowWindow($hwnd, 9) # SW_RESTORE
[Win32]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 500

$GWL_STYLE = -16
$GWL_EXSTYLE = -20

$style = [Win32]::GetWindowLong($hwnd, $GWL_STYLE)
$exStyle = [Win32]::GetWindowLong($hwnd, $GWL_EXSTYLE)
$parent = [Win32]::GetParent($hwnd)

Write-Host ""
Write-Host ("Style: 0x{0:X8}" -f $style)
Write-Host ("ExStyle: 0x{0:X8}" -f $exStyle)
Write-Host "Parent: $parent"
