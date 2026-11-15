package com.fournik8.industrialcommand;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.AtomicFile;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Locale;

/**
 * Android-only shell around the exact same static client used by the desktop
 * project. No Web server on the device, no external account, no File URI access.
 *
 * The privileged bridge is limited to the appassets HTTPS origin and MAIN
 * frame, not third-party iframes (e.g. embedded radio/YouTube content).
 */
public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String ORIGIN = "https://" + HOST;
    private static final String PAGE = ORIGIN + "/assets/index.html";
    private static final String SETTINGS_NAME = "settings-v1.json";
    private static final int MAX_SETTINGS_BYTES = 2 * 1024 * 1024;
    private static final int MAX_EXPORT_BYTES = 12 * 1024 * 1024;
    private static final int PICK_IMPORT = 3201;
    private static final int PICK_EXPORT = 3202;

    private WebView webView;
    private AtomicFile settingsFile;
    private ValueCallback<Uri[]> filePicker;
    private PendingExport pendingExport;

    private static final class PendingExport {
        final String id;
        final JavaScriptReplyProxy reply;
        final byte[] bytes;

        PendingExport(String id, JavaScriptReplyProxy reply, byte[] bytes) {
            this.id = id;
            this.reply = reply;
            this.bytes = bytes;
        }
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(15, 23, 25));
        getWindow().setNavigationBarColor(Color.rgb(15, 23, 25));
        settingsFile = new AtomicFile(new File(getFilesDir(), SETTINGS_NAME));

        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            TextView message = new TextView(this);
            message.setText("Industrial Command needs an up-to-date Android System WebView.\n\n" +
                    "Update Android System WebView or Chrome through your device's app store, " +
                    "then reopen Industrial Command.");
            message.setTextSize(18);
            message.setTextColor(Color.WHITE);
            message.setBackgroundColor(Color.rgb(15, 23, 25));
            message.setPadding(38, 65, 38, 38);
            setContentView(message);
            return;
        }

        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(15, 23, 25));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        // User-selected Android document/audio content:// URIs are needed for import
        // and local music. This does NOT permit arbitrary file:// access.
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri uri = request.getUrl();
                if (isTrustedAppPage(uri)) return false;
                // Never allow an untrusted page to become the main WebView
                // document; the native bridge remains origin-restricted.
                if ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme())) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (ActivityNotFoundException ignored) { }
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePicker != null) filePicker.onReceiveValue(null);
                filePicker = callback;
                try {
                    Intent chooser = params.createIntent();
                    startActivityForResult(chooser, PICK_IMPORT);
                    return true;
                } catch (ActivityNotFoundException error) {
                    filePicker = null;
                    callback.onReceiveValue(null);
                    return false;
                }
            }
        });

        WebViewCompat.addWebMessageListener(webView, "IndustrialAndroid",
                Collections.singleton(ORIGIN), (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                    if (!isMainFrame || !isTrustedOrigin(sourceOrigin)) return;
                    handleNativeRequest(message, replyProxy);
                });

        setContentView(webView);
        webView.loadUrl(PAGE);
    }

    private boolean isTrustedOrigin(Uri uri) {
        return uri != null && "https".equals(uri.getScheme()) && HOST.equals(uri.getHost())
                && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    private boolean isTrustedAppPage(Uri uri) {
        return isTrustedOrigin(uri) && uri.getPath() != null && uri.getPath().startsWith("/assets/");
    }

    private JSONObject packet(String id, boolean ok, Object data) throws JSONException {
        JSONObject reply = new JSONObject();
        reply.put("id", id);
        reply.put("ok", ok);
        reply.put(ok ? "data" : "error", data == null ? JSONObject.NULL : data);
        return reply;
    }

    private void send(JavaScriptReplyProxy proxy, String id, boolean ok, Object result) {
        try {
            proxy.postMessage(packet(id, ok, result).toString());
        } catch (Exception ignored) {
            // The UI can be destroyed while Android's file picker is open.
        }
    }

    private JSONObject readSettings() throws IOException, JSONException {
        byte[] bytes;
        try {
            bytes = settingsFile.readFully();
        } catch (FileNotFoundException e) {
            return null;
        }
        if (bytes.length > MAX_SETTINGS_BYTES) throw new IOException("Saved settings exceed size limit");
        JSONObject json = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
        if (json.optInt("schemaVersion", 0) != 1) throw new IOException("Unsupported settings schema");
        return json;
    }

    private void saveSettings(JSONObject settings) throws IOException {
        if (settings == null || settings.optInt("schemaVersion", 0) != 1) {
            throw new IOException("Invalid Industrial Command settings document");
        }
        byte[] bytes = settings.toString().getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 5 || bytes.length > MAX_SETTINGS_BYTES) {
            throw new IOException("Settings size exceeds 2 MiB");
        }
        FileOutputStream stream = null;
        try {
            stream = settingsFile.startWrite();
            stream.write(bytes);
            stream.flush();
            settingsFile.finishWrite(stream);
        } catch (IOException | RuntimeException error) {
            if (stream != null) settingsFile.failWrite(stream);
            throw error;
        }
    }

    private void handleNativeRequest(WebMessageCompat message, JavaScriptReplyProxy reply) {
        String id = "";
        try {
            JSONObject request = new JSONObject(message.getData());
            id = request.optString("id", "");
            if (id.isEmpty() || id.length() > 24) return;
            String action = request.optString("action", "");
            switch (action) {
                case "settings.load": {
                    JSONObject saved = readSettings();
                    send(reply, id, true, saved == null ? JSONObject.NULL : saved);
                    break;
                }
                case "settings.save": {
                    saveSettings(request.optJSONObject("settings"));
                    send(reply, id, true, true);
                    break;
                }
                case "file.export": {
                    if (pendingExport != null) {
                        throw new IOException("Close the previous Android export dialog first");
                    }
                    String filename = request.optString("name", "industrial-command-export.txt");
                    filename = filename.replaceAll("[^a-zA-Z0-9_.-]", "_");
                    if (filename.length() < 1 || filename.length() > 120) {
                        throw new IOException("Invalid export filename");
                    }
                    String mime = request.optString("mime", "text/plain");
                    if (!mime.equals("text/plain") && !mime.equals("text/csv") &&
                            !mime.equals("application/json")) {
                        throw new IOException("Unsupported export file type");
                    }
                    byte[] body = request.optString("content", "").getBytes(StandardCharsets.UTF_8);
                    if (body.length < 1 || body.length > MAX_EXPORT_BYTES) {
                        throw new IOException("Export too large (12 MiB maximum)");
                    }
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType(mime);
                    intent.putExtra(Intent.EXTRA_TITLE, filename);
                    pendingExport = new PendingExport(id, reply, body);
                    try {
                        startActivityForResult(intent, PICK_EXPORT);
                    } catch (Exception error) {
                        pendingExport = null;
                        throw error;
                    }
                    break;
                }
                default:
                    send(reply, id, false, "Unsupported Android operation");
            }
        } catch (Exception error) {
            send(reply, id, false, error.getMessage() == null ? "Android operation failed" : error.getMessage());
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == PICK_IMPORT && filePicker != null) {
            filePicker.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            filePicker = null;
            return;
        }

        if (requestCode == PICK_EXPORT && pendingExport != null) {
            PendingExport pending = pendingExport;
            pendingExport = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null) {
                send(pending.reply, pending.id, false, "Export cancelled");
                return;
            }
            try (OutputStream out = getContentResolver().openOutputStream(data.getData(), "w")) {
                if (out == null) throw new IOException("Android couldn't open selected file");
                out.write(pending.bytes);
                out.flush();
                send(pending.reply, pending.id, true, true);
            } catch (Exception error) {
                send(pending.reply, pending.id, false, error.getMessage());
            }
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else if (webView != null) {
            webView.evaluateJavascript("window.ICAndroidUI?.id() || 'mine'", value -> {
                if (value != null && !"\"mine\"".equals(value)) {
                    webView.evaluateJavascript("window.ICAndroidUI?.openTab('mine',true)", null);
                } else {
                    MainActivity.super.onBackPressed();
                }
            });
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (filePicker != null) filePicker.onReceiveValue(null);
        filePicker = null;
        pendingExport = null;
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
