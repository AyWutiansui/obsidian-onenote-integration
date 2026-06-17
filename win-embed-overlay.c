/*
 * win-embed.exe - Window embedding using owned popup overlay strategy
 *
 * This version uses an owned WS_POPUP overlay window to properly handle
 * z-order with Obsidian's modals. The overlay is owned by Obsidian's main
 * window, so Windows DWM automatically places it below Obsidian's modals.
 *
 * Build:
 *   cl /O2 win-embed-overlay.c user32.lib psapi.lib dwmapi.lib /Fe:win-embed.exe
 *
 * Commands:
 *   embed <hwnd>           - Embed window using overlay, enter stdin loop
 *   reparent <hwnd> [host] - One-shot reparent into overlay (auto-find Obsidian)
 *   detach <hwnd>          - Restore window to original state
 *   test                   - Diagnostic test
 */

#define _WIN32_WINNT 0x0603  /* Windows 8.1+ for DPI awareness APIs */
#define UNICODE
#define _UNICODE

#include <windows.h>
#include <psapi.h>
#include <dwmapi.h>
#include <shellscalingapi.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

/* ── Overlay window infrastructure ───────────────────────────────── */

#define OVERLAY_CLASS L"OneNoteEmbedOverlay"

static HWND     g_overlayHwnd         = NULL;
static HWND     g_savedOneNoteParent  = NULL;
static LONG     g_savedStyle          = 0;
static LONG     g_savedExStyle        = 0;
static int      g_isReparented        = 0;
static HINSTANCE g_hInst              = NULL;

static LRESULT CALLBACK OverlayWndProc(HWND hwnd, UINT msg,
    WPARAM wParam, LPARAM lParam)
{
    /* HTTRANSPARENT: all mouse input passes through to OneNote child */
    if (msg == WM_NCHITTEST) return HTTRANSPARENT;

    /* Suppress activation/focus — overlay must never steal focus */
    if (msg == WM_ACTIVATE)      return 0;
    if (msg == WM_SETFOCUS)      return 0;
    if (msg == WM_MOUSEACTIVATE) return MA_NOACTIVATE;

    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

static void registerOverlayClass(void) {
    if (!g_hInst) g_hInst = GetModuleHandle(NULL);
    WNDCLASSW wc = {0};
    wc.lpfnWndProc   = OverlayWndProc;
    wc.hInstance      = g_hInst;
    wc.lpszClassName  = OVERLAY_CLASS;
    RegisterClassW(&wc);
}

/* Create a borderless popup window owned by Obsidian's main window.
 * Owned popups are managed by Windows DWM and respect the owner's z-order. */
static HWND createOverlayWindow(HWND obsHwnd) {
    registerOverlayClass();
    HWND hwnd = CreateWindowExW(
        WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,  /* no taskbar icon, never activates */
        OVERLAY_CLASS,
        L"OneNoteEmbed",
        WS_POPUP | WS_CLIPSIBLINGS,  /* borderless, owned by obsHwnd */
        0, 0, 800, 600,
        obsHwnd,                     /* owner = Obsidian main window */
        NULL, g_hInst, NULL);
    if (hwnd) {
        fprintf(stderr, "OVERLAY: created %p, owner=%p\n", hwnd, obsHwnd);
    }
    return hwnd;
}

static void destroyOverlayWindow(void) {
    if (g_overlayHwnd && IsWindow(g_overlayHwnd)) {
        ShowWindow(g_overlayHwnd, SW_HIDE);
        DestroyWindow(g_overlayHwnd);
    }
    g_overlayHwnd = NULL;
}

/* Strip window frame styles and reparent into overlay.
 * Frame stripping ALWAYS succeeds (title bar, borders removed so content fills
 * the calculated coordinates). SetParent is attempted but optional — if it
 * fails, the window stays top-level with stripped frame (position-only mode).
 */
static int reparentIntoOverlay(HWND targetHwnd, HWND overlayHwnd) {
    fprintf(stderr, "REPARENT: target=%p overlay=%p\n", targetHwnd, overlayHwnd);

    /* Save original state for cleanup */
    g_savedOneNoteParent = GetParent(targetHwnd);
    g_savedStyle    = GetWindowLong(targetHwnd, GWL_STYLE);
    g_savedExStyle  = GetWindowLong(targetHwnd, GWL_EXSTYLE);

    fprintf(stderr, "REPARENT: saved parent=%p style=%lx exstyle=%lx\n",
            g_savedOneNoteParent, g_savedStyle, g_savedExStyle);

    /* Step 1: Strip frame styles (title bar, borders, resize grips).
     * Keep WS_POPUP for now — will be changed to WS_CHILD only if reparent succeeds.
     * This ensures content fills the calculated coordinates regardless of reparent. */
    LONG newStyle = (g_savedStyle
        & ~(WS_CAPTION | WS_THICKFRAME | WS_SYSMENU
            | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_BORDER))
        | WS_VISIBLE | WS_CLIPSIBLINGS;

    LONG newExStyle = g_savedExStyle
        & ~(WS_EX_DLGMODALFRAME | WS_EX_WINDOWEDGE
            | WS_EX_CLIENTEDGE  | WS_EX_STATICEDGE
            | WS_EX_APPWINDOW   | WS_EX_TOOLWINDOW);

    fprintf(stderr, "REPARENT: stripping frame → style=%lx exstyle=%lx\n", newStyle, newExStyle);

    SetLastError(0);
    SetWindowLong(targetHwnd, GWL_STYLE, newStyle);
    if (GetLastError() != 0) {
        fprintf(stderr, "REPARENT: SetWindowLong(GWL_STYLE) failed, error=%lu\n", GetLastError());
        return 0;
    }
    SetLastError(0);
    SetWindowLong(targetHwnd, GWL_EXSTYLE, newExStyle);
    if (GetLastError() != 0) {
        fprintf(stderr, "REPARENT: SetWindowLong(GWL_EXSTYLE) failed, error=%lu\n", GetLastError());
        SetWindowLong(targetHwnd, GWL_STYLE, g_savedStyle);
        return 0;
    }

    /* Force style change to take effect immediately */
    SetWindowPos(targetHwnd, NULL, 0, 0, 0, 0,
                 SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);

    /* Step 2: Try SetParent (optional — may fail cross-process) */
    SetLastError(0);
    LONG childStyle = (newStyle & ~WS_POPUP) | WS_CHILD;
    SetWindowLong(targetHwnd, GWL_STYLE, childStyle);

    HWND result = SetParent(targetHwnd, overlayHwnd);
    DWORD lastError = GetLastError();

    fprintf(stderr, "REPARENT: SetParent returned %p, lastError=%lu\n", result, lastError);

    if (result != NULL || lastError == 0) {
        fprintf(stderr, "REPARENT: SetParent succeeded (reparent mode)\n");
        ShowWindow(targetHwnd, SW_SHOW);
        g_isReparented = 1;
        return 1;
    }

    /* SetParent failed — revert to stripped-frame style (without WS_CHILD) */
    fprintf(stderr, "REPARENT: SetParent failed, keeping stripped frame (position-only mode)\n");
    SetWindowLong(targetHwnd, GWL_STYLE, newStyle);
    SetWindowPos(targetHwnd, NULL, 0, 0, 0, 0,
                 SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
    ShowWindow(targetHwnd, SW_SHOW);
    return 0;  /* 0 = position-only mode (not an error) */
}

/* Reposition overlay at screen coordinates.
 * In reparent mode: target fills overlay client area at (0,0).
 * In position-only mode: only move target; overlay stays hidden. */
static void repositionOverlay(HWND targetHwnd, int x, int y, int w, int h) {
    if (x < -5000) {
        /* Hide: move everything off-screen */
        if (g_isReparented && g_overlayHwnd && IsWindow(g_overlayHwnd)) {
            SetWindowPos(g_overlayHwnd, NULL, -32000, -32000, 1, 1,
                         SWP_NOACTIVATE | SWP_NOZORDER);
        } else if (targetHwnd && IsWindow(targetHwnd)) {
            SetWindowPos(targetHwnd, NULL, -32000, -32000, 1, 1,
                         SWP_NOACTIVATE | SWP_NOZORDER);
        }
        return;
    }

    fprintf(stderr, "REPOSITION: (%d, %d) %dx%d reparented=%d\n",
            x, y, w, h, g_isReparented);

    if (g_isReparented) {
        /* Reparent mode: overlay + target at (0,0) inside overlay */
        if (!g_overlayHwnd || !IsWindow(g_overlayHwnd)) return;
        SetWindowPos(g_overlayHwnd, HWND_TOP, x, y, w, h, SWP_SHOWWINDOW);
        if (targetHwnd && IsWindow(targetHwnd)) {
            SetWindowPos(targetHwnd, HWND_TOP, 0, 0, w, h, SWP_NOACTIVATE);
        }
    } else {
        /* Position-only mode: move target directly to screen coords */
        if (targetHwnd && IsWindow(targetHwnd)) {
            SetWindowPos(targetHwnd, HWND_TOP, x, y, w, h,
                         SWP_NOACTIVATE | SWP_SHOWWINDOW);
        }
    }
}

/* Cleanup: restore target to original parent, destroy overlay. */
static void cleanupOverlay(HWND targetHwnd) {
    if (g_isReparented && targetHwnd && IsWindow(targetHwnd)) {
        fprintf(stderr, "CLEANUP: restoring window\n");

        /* Restore original styles */
        SetWindowLong(targetHwnd, GWL_STYLE,   g_savedStyle);
        SetWindowLong(targetHwnd, GWL_EXSTYLE, g_savedExStyle);

        /* Restore original parent */
        if (g_savedOneNoteParent) {
            SetParent(targetHwnd, g_savedOneNoteParent);
        } else {
            SetParent(targetHwnd, NULL);
        }

        /* Make visible and top-level */
        SetWindowPos(targetHwnd, HWND_TOP, 0, 0, 0, 0,
                     SWP_NOMOVE | SWP_NOSIZE | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
        SetForegroundWindow(targetHwnd);
        ShowWindow(targetHwnd, SW_RESTORE);

        g_isReparented = 0;
    }

    destroyOverlayWindow();
    g_savedOneNoteParent = NULL;

    if (g_hInst) {
        UnregisterClassW(OVERLAY_CLASS, g_hInst);
    }

    fprintf(stderr, "CLEANUP: done\n");
}

/* ── Window finder functions ───────────────────────────────────── */

typedef struct {
    HWND  foundHwnd;
    DWORD pid;
    const wchar_t *titleSub;
} FindCtx;

static BOOL CALLBACK findObsidianProc(HWND h, LPARAM lp) {
    DWORD pid;
    wchar_t name[MAX_PATH];
    HANDLE p;
    DWORD sz;

    GetWindowThreadProcessId(h, &pid);
    name[0] = 0;
    p = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (p) {
        sz = MAX_PATH;
        QueryFullProcessImageNameW(p, 0, name, &sz);
        CloseHandle(p);
    }
    if (wcsstr(name, L"Obsidian") && IsWindowVisible(h)
        && GetParent(h) == NULL) {
        *((HWND *)lp) = h;
        return FALSE;
    }
    return TRUE;
}

static HWND findObsidianWindow(void) {
    HWND hwnd = NULL;
    EnumWindows(findObsidianProc, (LPARAM)&hwnd);
    return hwnd;
}

/* ── Parse HWND from string (decimal or 0x hex) ───────────────── */

static HWND parseHwnd(const char *s) {
    LONG_PTR val;
    if (s[0] == '0' && (s[1] == 'x' || s[1] == 'X')) {
        val = strtoll(s, NULL, 16);
    } else {
        val = strtoll(s, NULL, 10);
    }
    return (HWND)val;
}

/* ── Commands ──────────────────────────────────────────────────── */

static int cmd_embed(int argc, char *argv[]) {
    HWND targetHwnd;
    int running = 1;
    char buf[256];
    int x, y, w, h;

    if (argc < 3) {
        fprintf(stderr, "embed: hwnd required\n");
        printf("ERR:hwnd required\n");
        return 1;
    }

    targetHwnd = parseHwnd(argv[2]);
    if (!IsWindow(targetHwnd)) {
        fprintf(stderr, "embed: invalid hwnd %s\n", argv[2]);
        printf("ERR:Invalid window handle\n");
        return 1;
    }

    /* Find Obsidian window to use as overlay owner */
    HWND obsHwnd = NULL;
    if (argc >= 4) {
        obsHwnd = parseHwnd(argv[3]);
        if (!IsWindow(obsHwnd)) {
            fprintf(stderr, "embed: invalid obsHwnd %s, falling back to auto-detect\n", argv[3]);
            obsHwnd = NULL;
        }
    }
    if (!obsHwnd) {
        obsHwnd = findObsidianWindow();
    }
    if (!obsHwnd || !IsWindow(obsHwnd)) {
        fprintf(stderr, "embed: Obsidian window not found\n");
        printf("ERR:Obsidian window not found\n");
        return 1;
    }

    /* Create overlay owned by Obsidian */
    g_overlayHwnd = createOverlayWindow(obsHwnd);
    if (!g_overlayHwnd) {
        fprintf(stderr, "embed: failed to create overlay\n");
        printf("ERR:Failed to create overlay\n");
        return 1;
    }

    /* Reparent target into overlay (may fail cross-process — that's OK) */
    if (!reparentIntoOverlay(targetHwnd, g_overlayHwnd)) {
        fprintf(stderr, "embed: reparent failed, falling back to position-only mode\n");
        /* Hide overlay — in position-only mode we only move the target window.
         * Keep overlay HWND alive for process lifecycle. */
        ShowWindow(g_overlayHwnd, SW_HIDE);
    }

    printf("OK:%lld\n", (long long)(LONG_PTR)targetHwnd);
    fflush(stdout);

    /* stdin command loop — pump window messages while waiting for input.
     * Without a message pump the main thread blocks on fgets and cannot
     * dispatch cross-process WM_ACTIVATE / WM_SETFOCUS, causing deadlock.
     *
     * Use PeekNamedPipe to check for stdin data without blocking.
     * MsgWaitForMultipleObjects is unreliable with anonymous pipe handles
     * (as created by Node.js child_process.spawn). */
    {
        HANDLE hStdin = GetStdHandle(STD_INPUT_HANDLE);
        MSG msg;
        DWORD bytesAvail;

        while (running) {
            /* Process all pending window messages first */
            while (PeekMessage(&msg, NULL, 0, 0, PM_REMOVE)) {
                TranslateMessage(&msg);
                DispatchMessage(&msg);
            }

            /* Check if stdin pipe has data */
            bytesAvail = 0;
            if (!PeekNamedPipe(hStdin, NULL, 0, NULL, &bytesAvail, NULL) || bytesAvail == 0) {
                Sleep(10);  /* No data — yield CPU, let messages accumulate */
                continue;
            }

            /* stdin data available — read a line */
            if (!fgets(buf, sizeof(buf), stdin))
                break;
            buf[strcspn(buf, "\r\n")] = 0;

            if (strncmp(buf, "EXIT", 4) == 0) {
                fprintf(stderr, "EMBED: EXIT - cleaning up\n");
                cleanupOverlay(targetHwnd);
                running = 0;
                break;
            }

            if (strncmp(buf, "DETACH", 6) == 0) {
                fprintf(stderr, "EMBED: DETACH - restoring window\n");
                cleanupOverlay(targetHwnd);
                printf("DETACH_OK\n");
                fflush(stdout);
                continue;
            }

            /* Check if window is still valid */
            if (!IsWindow(targetHwnd)) {
                fprintf(stderr, "LOOP: hwnd %p no longer valid\n", targetHwnd);
                running = 0;
                break;
            }

            if (sscanf(buf, "%d,%d,%d,%d", &x, &y, &w, &h) == 4) {
                repositionOverlay(targetHwnd, x, y, w, h);
            }
        }

        /* Drain any remaining messages before cleanup */
        while (PeekMessage(&msg, NULL, 0, 0, PM_REMOVE)) {
            TranslateMessage(&msg);
            DispatchMessage(&msg);
        }
    }

    fprintf(stderr, "LOOP: exited\n");
    if (g_isReparented) cleanupOverlay(targetHwnd);

    return 0;
}

static int cmd_reparent(int argc, char *argv[]) {
    HWND targetHwnd;

    if (argc < 3) {
        fprintf(stderr, "reparent: target hwnd required\n");
        printf("ERR:hwnd required\n");
        return 1;
    }

    targetHwnd = parseHwnd(argv[2]);
    if (!IsWindow(targetHwnd)) {
        printf("ERR:Invalid window handle\n");
        return 1;
    }

    /* Find Obsidian and create overlay */
    HWND obsHwnd = findObsidianWindow();
    if (!obsHwnd || !IsWindow(obsHwnd)) {
        printf("ERR:Obsidian window not found\n");
        return 1;
    }

    g_overlayHwnd = createOverlayWindow(obsHwnd);
    if (!g_overlayHwnd) {
        printf("ERR:Failed to create overlay\n");
        return 1;
    }

    if (reparentIntoOverlay(targetHwnd, g_overlayHwnd)) {
        printf("OK\n");
    } else {
        printf("ERR:Reparent failed\n");
        destroyOverlayWindow();
    }
    return 0;
}

static int cmd_detach(int argc, char *argv[]) {
    HWND targetHwnd;

    if (argc < 3) {
        fprintf(stderr, "detach: hwnd required\n");
        printf("ERR:hwnd required\n");
        return 1;
    }

    targetHwnd = parseHwnd(argv[2]);
    if (!IsWindow(targetHwnd)) {
        printf("ERR:Invalid window handle\n");
        return 1;
    }

    cleanupOverlay(targetHwnd);
    printf("OK\n");
    return 0;
}

static int cmd_test(int argc, char *argv[]) {
    printf("OK: win-embed.exe (overlay version) is working\n");

    HWND obsHwnd = findObsidianWindow();
    if (obsHwnd) {
        printf("INFO: Found Obsidian window: %p\n", obsHwnd);
    } else {
        printf("INFO: Obsidian window not found\n");
    }
    return 0;
}

/* ── Main ──────────────────────────────────────────────────────── */

int main(int argc, char *argv[]) {
    const char *cmd;

    /* Set DPI awareness BEFORE any window creation to match OneNote's DPI scaling.
     * Without this, overlay is DPI-unaware (0) while OneNote is system-aware (1),
     * causing Windows to bitmap-stretch the reparented content → distorted icons. */
    SetProcessDpiAwareness(PROCESS_PER_MONITOR_DPI_AWARE);

    if (argc < 2) {
        fprintf(stderr, "win-embed.exe <command> [args]\n");
        fprintf(stderr, "Commands:\n");
        fprintf(stderr, "  embed <hwnd>           - embed + stdin loop (overlay)\n");
        fprintf(stderr, "  reparent <hwnd> [host] - one-shot reparent into overlay\n");
        fprintf(stderr, "  detach <hwnd>          - restore window\n");
        fprintf(stderr, "  test                   - diagnostic test\n");
        return 1;
    }

    cmd = argv[1];
    if (strcmp(cmd, "embed")    == 0) return cmd_embed(argc, argv);
    if (strcmp(cmd, "reparent") == 0) return cmd_reparent(argc, argv);
    if (strcmp(cmd, "detach")   == 0) return cmd_detach(argc, argv);
    if (strcmp(cmd, "test")     == 0) return cmd_test(argc, argv);

    fprintf(stderr, "Unknown command: %s\n", cmd);
    return 1;
}
