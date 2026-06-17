Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    
    [DllImport("user32.dll")]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    
    [DllImport("user32.dll")]
    public static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);
    
    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);
    
    [DllImport("kernel32.dll")]
    public static extern uint GetLastError();
}
"@

# Find OneNote window
$onenoteHwnd = [Win32]::FindWindow("Framework::CFrame", $null)
if ($onenoteHwnd -eq [IntPtr]::Zero) {
    Write-Host "OneNote window not found"
    exit 1
}

Write-Host "OneNote HWND: $([IntPtr]::Size)"
Write-Host "OneNote HWND value: $onenoteHwnd"

# Try to find Obsidian window by enumerating all windows
Add-Type -AssemblyName System.Windows.Forms
$obsidianHwnd = [IntPtr]::Zero

# Use a simple approach: find window with "Obsidian" in title or class
$callback = {
    param($hWnd, $lParam)
    
    $title = New-Object System.Text.StringBuilder 256
    Add-Type -TypeDefinition @"
    using System;
    using System.Runtime.InteropServices;
    using System.Text;
    public class User32 {
        [DllImport("user32.dll")]
        public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
        
        [DllImport("user32.dll")]
        public static extern int GetClassName(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    }
"@ -ErrorAction SilentlyContinue
    
    return $true
}

# Simpler approach: just check if we can get Obsidian PID
$obsidianProcess = Get-Process | Where-Object { $_.ProcessName -eq "Obsidian" } | Select-Object -First 1
if ($obsidianProcess) {
    Write-Host "Obsidian PID: $($obsidianProcess.Id)"
    Write-Host "Obsidian MainWindowHandle: $($obsidianProcess.MainWindowHandle)"
} else {
    Write-Host "Obsidian process not found"
}
