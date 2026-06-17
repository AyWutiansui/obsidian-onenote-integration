/*
 * win-embed-test.exe - Standalone tests for win-embed.c window management
 *
 * Build:
 *   cl /O2 /DWIN_EMBED_TEST win-embed-test.c user32.lib psapi.lib dwmapi.lib
 *       /Fe:win-embed-test.exe
 *
 * This file includes win-embed.c directly (with WIN_EMBED_TEST defined)
 * so it has access to all static functions and globals.
 */

#ifndef WIN_EMBED_TEST
#define WIN_EMBED_TEST
#endif

#include "../win-embed.c"

/* ── Test framework ────────────────────────────────────────────── */

static int g_pass = 0, g_fail = 0;

#define ASSERT_TRUE(cond, msg) do { \
    if (cond) { printf("  PASS: %s\n", msg); g_pass++; } \
    else { printf("  FAIL: %s (line %d)\n", msg, __LINE__); g_fail++; } \
} while(0)

/* ── Helpers ───────────────────────────────────────────────────── */

static int g_classCounter = 0;

static HWND create_test_window(const wchar_t *title, DWORD style) {
    wchar_t className[128];
    WNDCLASSW wc;

    g_classCounter++;
    wsprintfW(className, L"TestEmbedClass_%d", g_classCounter);

    memset(&wc, 0, sizeof(wc));
    wc.lpfnWndProc   = DefWindowProcW;
    wc.hInstance      = GetModuleHandle(NULL);
    wc.lpszClassName  = className;
    RegisterClassW(&wc);

    HWND h = CreateWindowExW(
        0, className, title,
        style,
        100, 100, 400, 300,
        NULL, NULL, GetModuleHandle(NULL), NULL);

    if (h) ShowWindow(h, SW_SHOW);
    return h;
}

static void destroy_test_window(HWND h) {
    if (h && IsWindow(h)) {
        DestroyWindow(h);
    }
}

/* Reset global state between tests */
static void reset_globals(void) {
    g_hostHwnd      = NULL;
    g_savedParent   = NULL;
    g_savedStyle    = 0;
    g_savedExStyle  = 0;
    g_isReparented  = 0;
}

/* ── Test cases ────────────────────────────────────────────────── */

static void test_create_and_find_window(void) {
    printf("\n[TEST] test_create_and_find_window\n");

    HWND w = create_test_window(L"TestWindow_1234", WS_OVERLAPPEDWINDOW);
    ASSERT_TRUE(w != NULL, "Create test window with known title");
    ASSERT_TRUE(IsWindow(w), "Window handle is valid");

    /* findWindowByTitle searches by substring */
    HWND found = findWindowByTitle(L"TestWindow_1234");
    ASSERT_TRUE(found != NULL, "findWindowByTitle finds the window");
    ASSERT_TRUE(found == w, "findWindowByTitle returns correct hwnd");

    /* Search for something that doesn't exist */
    HWND notFound = findWindowByTitle(L"NonExistent_ZZZZZ_9999");
    ASSERT_TRUE(notFound == NULL, "findWindowByTitle returns NULL for unknown");

    destroy_test_window(w);
}

static void test_reparent_directly(void) {
    printf("\n[TEST] test_reparent_directly\n");
    reset_globals();

    HWND parent = create_test_window(L"ParentWindow", WS_OVERLAPPEDWINDOW);
    HWND child  = create_test_window(L"ChildWindow",  WS_OVERLAPPEDWINDOW);

    ASSERT_TRUE(parent != NULL, "Parent window created");
    ASSERT_TRUE(child  != NULL, "Child window created");

    /* Verify initial state */
    LONG origStyle = GetWindowLong(child, GWL_STYLE);
    ASSERT_TRUE((origStyle & WS_CAPTION) != 0, "Child initially has WS_CAPTION");
    ASSERT_TRUE(GetParent(child) == NULL || GetParent(child) == GetDesktopWindow(),
                "Child initially has no explicit parent");

    /* Reparent */
    int ok = reparentDirectly(child, parent);
    ASSERT_TRUE(ok == 1, "reparentDirectly returns success");

    /* Verify styles changed */
    LONG newStyle = GetWindowLong(child, GWL_STYLE);
    ASSERT_TRUE((newStyle & WS_CHILD) != 0, "WS_CHILD is set after reparent");
    ASSERT_TRUE((newStyle & WS_CAPTION) == 0, "WS_CAPTION cleared after reparent");
    ASSERT_TRUE((newStyle & WS_VISIBLE) != 0, "WS_VISIBLE set after reparent");
    ASSERT_TRUE((newStyle & WS_CLIPSIBLINGS) != 0, "WS_CLIPSIBLINGS set after reparent");

    /* Verify parent changed */
    HWND actualParent = GetParent(child);
    ASSERT_TRUE(actualParent == parent, "Parent is now the host window");

    /* Verify saved state */
    ASSERT_TRUE(g_savedStyle == origStyle, "Saved style matches original");
    ASSERT_TRUE(g_hostHwnd == parent, "g_hostHwnd set to parent");

    destroy_test_window(child);
    destroy_test_window(parent);
    reset_globals();
}

static void test_cleanup_reparent(void) {
    printf("\n[TEST] test_cleanup_reparent\n");
    reset_globals();

    HWND parent = create_test_window(L"ParentWindow2", WS_OVERLAPPEDWINDOW);
    HWND child  = create_test_window(L"ChildWindow2",  WS_OVERLAPPEDWINDOW);

    ASSERT_TRUE(parent != NULL, "Parent window created");
    ASSERT_TRUE(child  != NULL, "Child window created");

    LONG origStyle   = GetWindowLong(child, GWL_STYLE);
    LONG origExStyle = GetWindowLong(child, GWL_EXSTYLE);

    /* Reparent then cleanup */
    int ok = reparentDirectly(child, parent);
    ASSERT_TRUE(ok == 1, "reparentDirectly returns success");

    cleanupReparent(child);

    /* Verify styles restored */
    LONG restoredStyle   = GetWindowLong(child, GWL_STYLE);
    LONG restoredExStyle = GetWindowLong(child, GWL_EXSTYLE);

    ASSERT_TRUE(restoredStyle == origStyle,
                "Style restored to original after cleanup");
    ASSERT_TRUE(restoredExStyle == origExStyle,
                "ExStyle restored to original after cleanup");
    ASSERT_TRUE(g_savedParent == NULL, "g_savedParent cleared after cleanup");
    ASSERT_TRUE(g_hostHwnd == NULL, "g_hostHwnd cleared after cleanup");
    ASSERT_TRUE(g_isReparented == 0, "g_isReparented cleared after cleanup");

    destroy_test_window(child);
    destroy_test_window(parent);
    reset_globals();
}

static void test_reposition_hidden(void) {
    printf("\n[TEST] test_reposition_hidden\n");
    reset_globals();

    HWND win = create_test_window(L"HiddenTest", WS_OVERLAPPEDWINDOW);
    ASSERT_TRUE(win != NULL, "Test window created");

    /* Reposition with x < -5000 should hide the window off-screen.
       Don't reparent first: for a top-level window SetWindowPos sets
       screen coordinates directly, so GetWindowRect returns them. */
    repositionChild(win, -10000, -10000, 100, 100);

    RECT rc;
    GetWindowRect(win, &rc);

    /* Window manager may adjust slightly, so allow tolerance */
    ASSERT_TRUE(rc.left < -30000, "Hidden window moved far off-screen (x)");
    ASSERT_TRUE(rc.top  < -30000, "Hidden window moved far off-screen (y)");

    destroy_test_window(win);
    reset_globals();
}

static void test_reposition_normal(void) {
    printf("\n[TEST] test_reposition_normal\n");
    reset_globals();

    HWND parent = create_test_window(L"ParentN", WS_OVERLAPPEDWINDOW);
    HWND child  = create_test_window(L"ChildN",  WS_OVERLAPPEDWINDOW);

    ASSERT_TRUE(parent != NULL, "Parent window created");
    ASSERT_TRUE(child  != NULL, "Child window created");

    reparentDirectly(child, parent);

    /* Get parent's client area origin in screen coords for validation */
    POINT origin;
    origin.x = 0;
    origin.y = 0;
    ClientToScreen(parent, &origin);

    /* Reposition with normal coordinates */
    int screenX = origin.x + 50;
    int screenY = origin.y + 50;
    repositionChild(child, screenX, screenY, 200, 150);

    RECT rc;
    GetWindowRect(child, &rc);
    int actualW = rc.right  - rc.left;
    int actualH = rc.bottom - rc.top;

    ASSERT_TRUE(actualW == 200, "Width set to 200");
    ASSERT_TRUE(actualH == 150, "Height set to 150");

    /* Position should be approximately correct (client-to-screen offset) */
    int expectedClientX = 50;
    int expectedClientY = 50;
    POINT checkPt;
    checkPt.x = rc.left;
    checkPt.y = rc.top;
    ScreenToClient(parent, &checkPt);

    /* Allow small tolerance for window border offsets */
    ASSERT_TRUE(abs(checkPt.x - expectedClientX) < 10,
                "Client X position approximately correct");
    ASSERT_TRUE(abs(checkPt.y - expectedClientY) < 10,
                "Client Y position approximately correct");

    cleanupReparent(child);
    destroy_test_window(child);
    destroy_test_window(parent);
    reset_globals();
}

static void test_list_windows(void) {
    printf("\n[TEST] test_list_windows\n");

    /* Enumerate visible windows using the list logic */
    EnumListCtx ctx = { 0, 0 };
    EnumWindows(listAllProc, (LPARAM)&ctx);

    ASSERT_TRUE(ctx.count > 0, "Found at least one visible top-level window");
    printf("  INFO: Found %d visible top-level windows (>100x100)\n", ctx.count);

    /* Also test with maxCount */
    EnumListCtx ctx2 = { 0, 3 };
    EnumWindows(listAllProc, (LPARAM)&ctx2);
    ASSERT_TRUE(ctx2.count <= 3, "maxCount limits enumeration to 3");
}

/* ── Main ──────────────────────────────────────────────────────── */

int main(int argc, char *argv[]) {
    printf("=== win-embed tests ===\n");

    test_create_and_find_window();
    test_reparent_directly();
    test_cleanup_reparent();
    test_reposition_hidden();
    test_reposition_normal();
    test_list_windows();

    printf("\n%d passed, %d failed\n", g_pass, g_fail);
    return g_fail > 0 ? 1 : 0;
}
