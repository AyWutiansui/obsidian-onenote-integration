/*
 * onenote-repos.exe - COM-based OneNote operations only
 *
 * Build:
 *   cl /O2 repos.c user32.lib ole32.lib oleaut32.lib /Fe:onenote-repos.exe
 *
 * Commands:
 *   navigate <pageId>  - navigate OneNote to a specific page
 *   url <pageId>       - get onenote:// URL for a page via COM
 *   quit               - quit OneNote application via COM
 *   test               - test COM connection and window detection
 *   find-window        - find OneNote window and print its HWND
 */

#define _WIN32_WINNT 0x0601
#define UNICODE
#define _UNICODE
#define COBJMACROS

#include <windows.h>
#include <shellapi.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>
#include <ole2.h>
#include <oaidl.h>

/* ── OneNote window finder ─────────────────────────────────────── */

static HWND findOneNoteWindow(void) {
    HWND h = FindWindowW(L"Framework::CFrame", NULL);
    if (!h) h = FindWindowW(L"ApplicationFrameWindow", NULL);
    return h;
}

/* ── COM helpers ───────────────────────────────────────────────── */

static IDispatch* getOneNote(void) {
    CLSID clsid;
    IDispatch *pDisp = NULL;
    HRESULT hr;

    if (FAILED(CLSIDFromProgID(L"OneNote.Application", &clsid))) {
        fprintf(stderr, "COM: CLSIDFromProgID failed\n");
        return NULL;
    }

    /* 1. GetActiveObject — ROT only, no auto-launch */
    IUnknown *pUnk = NULL;
    hr = GetActiveObject(&clsid, NULL, &pUnk);
    if (SUCCEEDED(hr) && pUnk) {
        hr = IUnknown_QueryInterface(pUnk, &IID_IDispatch, (void**)&pDisp);
        IUnknown_Release(pUnk);
        if (SUCCEEDED(hr) && pDisp) {
            fprintf(stderr, "COM: got OneNote via GetActiveObject (ROT)\n");
            return pDisp;
        }
        pDisp = NULL;
    }
    fprintf(stderr, "COM: GetActiveObject hr=0x%lx, trying CoCreateInstance\n", hr);

    /* 2. CoCreateInstance — may auto-launch OneNote */
    hr = CoCreateInstance(&clsid, NULL, CLSCTX_LOCAL_SERVER,
                          &IID_IDispatch, (void**)&pDisp);
    if (SUCCEEDED(hr) && pDisp) {
        fprintf(stderr, "COM: got OneNote via CoCreateInstance\n");
        return pDisp;
    }
    fprintf(stderr, "COM: CoCreateInstance hr=0x%lx\n", hr);

    /* 3. Retry GetActiveObject — CoCreateInstance may have registered it */
    pUnk = NULL;
    hr = GetActiveObject(&clsid, NULL, &pUnk);
    if (SUCCEEDED(hr) && pUnk) {
        hr = IUnknown_QueryInterface(pUnk, &IID_IDispatch, (void**)&pDisp);
        IUnknown_Release(pUnk);
        if (SUCCEEDED(hr) && pDisp) {
            fprintf(stderr, "COM: got OneNote via GetActiveObject (retry)\n");
            return pDisp;
        }
    }

    fprintf(stderr, "COM: all activation attempts failed\n");
    return NULL;
}

/* Call OneNote.Application.NavigateTo(pageId, "") via IDispatch */
static int callNavigateTo(IDispatch *app, const wchar_t *pageId) {
    DISPID dispid;
    LPOLESTR name = (LPOLESTR)L"NavigateTo";
    HRESULT hr = IDispatch_GetIDsOfNames(app, &IID_NULL, &name, 1, LOCALE_SYSTEM_DEFAULT, &dispid);
    if (FAILED(hr)) {
        fprintf(stderr, "NavigateTo: GetIDsOfNames failed hr=0x%lx (trying LOCALE_USER_DEFAULT)\n", hr);
        /* Fallback: try with LOCALE_USER_DEFAULT */
        hr = IDispatch_GetIDsOfNames(app, &IID_NULL, &name, 1, LOCALE_USER_DEFAULT, &dispid);
        if (FAILED(hr)) {
            fprintf(stderr, "NavigateTo: GetIDsOfNames failed again hr=0x%lx\n", hr);
            return 0;
        }
    }

    VARIANT args[2];
    DISPPARAMS params;

    /* COM args are passed in reverse order */
    VariantInit(&args[1]);
    args[1].vt = VT_BSTR;
    args[1].bstrVal = SysAllocString(pageId);

    VariantInit(&args[0]);
    args[0].vt = VT_BSTR;
    args[0].bstrVal = SysAllocString(L"");

    params.rgvarg = args;
    params.rgdispidNamedArgs = NULL;
    params.cArgs = 2;
    params.cNamedArgs = 0;

    VARIANT result;
    VariantInit(&result);
    hr = IDispatch_Invoke(app, dispid, &IID_NULL, 0,
                          DISPATCH_METHOD, &params, &result, NULL, NULL);

    VariantClear(&args[1]);
    VariantClear(&args[0]);
    VariantClear(&result);

    if (SUCCEEDED(hr)) {
        fprintf(stderr, "NavigateTo: success\n");
        return 1;
    }
    fprintf(stderr, "NavigateTo: Invoke failed hr=0x%lx\n", hr);
    return 0;
}

/* GetHyperlinkToObject — get proper onenote:// URL for a page */
static wchar_t* callGetHyperlinkToObject(IDispatch *app, const wchar_t *pageId) {
    DISPID dispid;
    LPOLESTR name = (LPOLESTR)L"GetHyperlinkToObject";
    HRESULT hr = IDispatch_GetIDsOfNames(app, &IID_NULL, &name, 1, LOCALE_SYSTEM_DEFAULT, &dispid);
    if (FAILED(hr)) {
        fprintf(stderr, "GetHyperlinkToObject: GetIDsOfNames failed hr=0x%lx (trying LOCALE_USER_DEFAULT)\n", hr);
        hr = IDispatch_GetIDsOfNames(app, &IID_NULL, &name, 1, LOCALE_USER_DEFAULT, &dispid);
        if (FAILED(hr)) {
            fprintf(stderr, "GetHyperlinkToObject: GetIDsOfNames failed again hr=0x%lx\n", hr);
            return NULL;
        }
    }

    VARIANT args[3];
    DISPPARAMS params;
    VARIANT result;
    BSTR resultBstr = NULL;
    wchar_t *out = NULL;

    VariantInit(&args[2]);
    args[2].vt = VT_BSTR;
    args[2].bstrVal = SysAllocString(pageId);

    VariantInit(&args[1]);
    args[1].vt = VT_BSTR;
    args[1].bstrVal = SysAllocString(L"");

    VariantInit(&args[0]);
    args[0].vt = VT_BSTR | VT_BYREF;
    args[0].pbstrVal = &resultBstr;

    params.rgvarg = args;
    params.rgdispidNamedArgs = NULL;
    params.cArgs = 3;
    params.cNamedArgs = 0;

    VariantInit(&result);
    hr = IDispatch_Invoke(app, dispid, &IID_NULL, 0,
                          DISPATCH_METHOD, &params, &result, NULL, NULL);

    if (SUCCEEDED(hr) && resultBstr) {
        out = _wcsdup(resultBstr);
        SysFreeString(resultBstr);
        fprintf(stderr, "GetHyperlinkToObject: success, URL=%S\n", out);
    } else {
        fprintf(stderr, "GetHyperlinkToObject: Invoke failed hr=0x%lx\n", hr);
    }

    VariantClear(&args[2]);
    VariantClear(&args[1]);
    VariantClear(&result);
    return out;
}

/* ── Commands ──────────────────────────────────────────────────── */

static int cmd_navigate(int argc, char *argv[]) {
    int len;
    wchar_t *pageId;
    IDispatch *app;

    if (argc < 3) {
        fprintf(stderr, "navigate: pageId required\n");
        printf("ERR:pageId required\n");
        return 1;
    }

    len = MultiByteToWideChar(CP_UTF8, 0, argv[2], -1, NULL, 0);
    pageId = (wchar_t*)malloc(len * sizeof(wchar_t));
    MultiByteToWideChar(CP_UTF8, 0, argv[2], -1, pageId, len);

    CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
    app = getOneNote();
    if (app) {
        if (callNavigateTo(app, pageId)) {
            IDispatch_Release(app);
            CoUninitialize();
            free(pageId);
            printf("OK\n");
            return 0;
        }
        IDispatch_Release(app);
    }

    /* Fallback: use GetHyperlinkToObject to get correct URL, then ShellExecute */
    fprintf(stderr, "navigate: NavigateTo failed, trying GetHyperlinkToObject\n");
    
    /* Need to re-get COM object since it was released above */
    app = getOneNote();
    if (app) {
        wchar_t *url = callGetHyperlinkToObject(app, pageId);
        IDispatch_Release(app);
        
        if (url) {
            fprintf(stderr, "navigate: got URL, opening with ShellExecute\n");
            HINSTANCE result = ShellExecuteW(NULL, L"open", url, NULL, NULL, SW_SHOWNORMAL);
            free(url);
            CoUninitialize();
            free(pageId);
            
            if ((INT_PTR)result > 32) {
                printf("OK\n");
                return 0;
            }
            fprintf(stderr, "navigate: ShellExecute failed, result=%p\n", result);
        } else {
            fprintf(stderr, "navigate: GetHyperlinkToObject failed\n");
        }
    }
    
    /* Last resort: try protocol URL (may not work for all page ID formats) */
    fprintf(stderr, "navigate: all COM methods failed, trying raw protocol URL\n");
    wchar_t *rawUrl = (wchar_t*)malloc((wcslen(pageId) + 20) * sizeof(wchar_t));
    wcscpy(rawUrl, L"onenote:");
    wcscat(rawUrl, pageId);
    HINSTANCE result = ShellExecuteW(NULL, L"open", rawUrl, NULL, NULL, SW_SHOWNORMAL);
    free(rawUrl);
    CoUninitialize();
    free(pageId);
    
    if ((INT_PTR)result > 32) {
        printf("OK\n");
        return 0;
    }
    printf("ERR:Failed to navigate to page\n");
    return 1;
}

/* cmd_url: Get onenote:// URL for a page via COM GetHyperlinkToObject */
static int cmd_url(int argc, char *argv[]) {
    int len;
    wchar_t *pageId;
    IDispatch *app;

    if (argc < 3) {
        fprintf(stderr, "url: pageId required\n");
        printf("ERR:pageId required\n");
        return 1;
    }

    len = MultiByteToWideChar(CP_UTF8, 0, argv[2], -1, NULL, 0);
    pageId = (wchar_t*)malloc(len * sizeof(wchar_t));
    MultiByteToWideChar(CP_UTF8, 0, argv[2], -1, pageId, len);

    CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
    app = getOneNote();
    if (!app) {
        fprintf(stderr, "url: could not get OneNote COM object\n");
        printf("ERR:Could not connect to OneNote COM\n");
        CoUninitialize();
        free(pageId);
        return 1;
    }

    wchar_t *result = callGetHyperlinkToObject(app, pageId);
    if (result) {
        /* Print just the URL to stdout, no prefix */
        printf("%S\n", result);
        free(result);
        IDispatch_Release(app);
        CoUninitialize();
        free(pageId);
        return 0;
    }

    fprintf(stderr, "url: GetHyperlinkToObject failed\n");
    printf("ERR:GetHyperlinkToObject failed\n");
    IDispatch_Release(app);
    CoUninitialize();
    free(pageId);
    return 1;
}

/* callQuit: Call OneNote.Application.Quit() via IDispatch */
static int callQuit(IDispatch *app) {
    DISPID dispid;
    LPOLESTR name = (LPOLESTR)L"Quit";
    HRESULT hr = IDispatch_GetIDsOfNames(app, &IID_NULL, &name, 1, 0, &dispid);
    if (FAILED(hr)) {
        /* Try well-known DISPID for Quit (0x00000012) */
        fprintf(stderr, "Quit: GetIDsOfNames failed hr=0x%lx, trying DISPID 0x12\n", hr);
        dispid = 0x00000012;
    }

    DISPPARAMS params;
    params.rgvarg = NULL;
    params.rgdispidNamedArgs = NULL;
    params.cArgs = 0;
    params.cNamedArgs = 0;

    VARIANT result;
    VariantInit(&result);
    hr = IDispatch_Invoke(app, dispid, &IID_NULL, 0,
                          DISPATCH_METHOD, &params, &result, NULL, NULL);

    VariantClear(&result);

    if (SUCCEEDED(hr)) {
        fprintf(stderr, "Quit: success\n");
        return 1;
    }
    fprintf(stderr, "Quit: Invoke failed hr=0x%lx\n", hr);
    return 0;
}

/* cmd_quit: Quit OneNote application via COM */
static int cmd_quit(int argc, char *argv[]) {
    IDispatch *app;

    CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
    app = getOneNote();
    if (!app) {
        fprintf(stderr, "quit: could not get OneNote COM object\n");
        printf("ERR:Could not connect to OneNote COM\n");
        CoUninitialize();
        return 1;
    }

    if (callQuit(app)) {
        IDispatch_Release(app);
        CoUninitialize();
        printf("OK\n");
        return 0;
    }

    fprintf(stderr, "quit: Quit method failed\n");
    printf("ERR:Quit failed\n");
    IDispatch_Release(app);
    CoUninitialize();
    return 1;
}

/* cmd_find_window: Find OneNote window and print its HWND */
static int cmd_find_window(int argc, char *argv[]) {
    HWND h = findOneNoteWindow();
    if (h) {
        printf("OK:%lld\n", (long long)(LONG_PTR)h);
        return 0;
    }
    printf("ERR:OneNote window not found\n");
    return 1;
}

/* cmd_show_window: Find OneNote window, ensure visible, print its HWND.
 * Handles cold start: CFrame may exist at (-21333,-21333) or be minimized. */
static int cmd_show_window(int argc, char *argv[]) {
    HWND h = findOneNoteWindow();
    if (!h) {
        printf("ERR:OneNote window not found\n");
        return 1;
    }

    RECT rc;
    GetWindowRect(h, &rc);

    /* Check if window is off-screen (cold start position) */
    if (rc.left < -10000 || rc.top < -10000) {
        fprintf(stderr, "show-window: window off-screen at (%ld,%ld), restoring\n",
                rc.left, rc.top);
        ShowWindow(h, SW_RESTORE);
        /* Move to a reasonable default position */
        SetWindowPos(h, HWND_TOP, 100, 100, 800, 600,
                     SWP_SHOWWINDOW);
    } else if (IsIconic(h)) {
        fprintf(stderr, "show-window: window minimized, restoring\n");
        ShowWindow(h, SW_RESTORE);
    } else if (!IsWindowVisible(h)) {
        fprintf(stderr, "show-window: window hidden, showing\n");
        ShowWindow(h, SW_SHOW);
    }

    printf("OK:%lld\n", (long long)(LONG_PTR)h);
    return 0;
}

static int cmd_test(int argc, char *argv[]) {
    IDispatch *app;
    CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
    app = getOneNote();
    if (app) {
        printf("OK: COM connection established\n");
        IDispatch_Release(app);
    } else {
        printf("ERR: Could not connect to OneNote COM\n");
    }
    HWND h = findOneNoteWindow();
    if (h) {
        printf("OK: OneNote window: %p\n", h);
    } else {
        printf("INFO: No OneNote window found\n");
    }
    CoUninitialize();
    return 0;
}

int main(int argc, char *argv[]) {
    const char *cmd;

    if (argc < 2) {
        fprintf(stderr, "onenote-repos.exe <command> [args]\n");
        fprintf(stderr, "Commands:\n");
        fprintf(stderr, "  navigate <pageId>  - navigate OneNote to page\n");
        fprintf(stderr, "  url <pageId>       - get onenote:// URL for page\n");
        fprintf(stderr, "  quit               - quit OneNote application\n");
        fprintf(stderr, "  test               - test COM + window detection\n");
        fprintf(stderr, "  find-window        - find OneNote window HWND\n");
        fprintf(stderr, "  show-window        - find OneNote window, ensure visible\n");
        return 1;
    }

    cmd = argv[1];
    if (strcmp(cmd, "navigate")    == 0) return cmd_navigate(argc, argv);
    if (strcmp(cmd, "url")         == 0) return cmd_url(argc, argv);
    if (strcmp(cmd, "quit")        == 0) return cmd_quit(argc, argv);
    if (strcmp(cmd, "test")        == 0) return cmd_test(argc, argv);
    if (strcmp(cmd, "find-window") == 0) return cmd_find_window(argc, argv);
    if (strcmp(cmd, "show-window") == 0) return cmd_show_window(argc, argv);

    fprintf(stderr, "Unknown command: %s\n", cmd);
    return 1;
}
