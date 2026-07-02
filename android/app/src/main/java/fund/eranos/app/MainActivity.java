package fund.eranos.app;

import android.app.ForegroundServiceStartNotAllowedException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String PREFS_NAME = "ditto_notification_config";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register native plugins before super.onCreate.
        registerPlugin(DittoNotificationPlugin.class);
        registerPlugin(TorPlugin.class);

        // If the user enabled Tor (apply on relaunch), start arti BEFORE
        // super.onCreate so the WebView SOCKS proxy override is installed
        // before the WebView issues any network request — no leak window.
        if (TorController.isEnabled(this)) {
            TorController.getInstance().start(getApplicationContext());
        }

        super.onCreate(savedInstanceState);

        // Only start the foreground service if the user has opted into
        // "persistent" notification style. Default is "push" (no service).
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String style = prefs.getString("notificationStyle", "push");

        if ("persistent".equals(style)) {
            try {
                Intent serviceIntent = new Intent(this, NotificationRelayService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(serviceIntent);
                } else {
                    startService(serviceIntent);
                }
            } catch (Exception e) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                        && e instanceof ForegroundServiceStartNotAllowedException) {
                    Log.w("MainActivity", "Could not start NotificationRelayService: " + e.getMessage());
                } else {
                    throw e;
                }
            }
        }

        // Handle notification tap deep link
        handleNotificationIntent(getIntent());

        // The Android WebView reports env(safe-area-inset-*) as 0, so inject the
        // real system-bar insets as CSS variables (--safe-area-inset-top/bottom)
        // that the web layer consumes (see src/index.css). Without this, the top
        // nav renders behind the status bar in the APK.
        applySafeAreaInsets();
    }

    /**
     * Read the status-bar (top) and navigation-bar (bottom) insets and write
     * them into the WebView as CSS pixel variables. Re-applies on every inset
     * change (rotation, status-bar show/hide, etc.).
     */
    private void applySafeAreaInsets() {
        final WebView webView = getBridge().getWebView();
        if (webView == null) return;

        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            float density = getResources().getDisplayMetrics().density;
            int topPx = Math.round(bars.top / density);
            int bottomPx = Math.round(bars.bottom / density);
            String js =
                "document.documentElement.style.setProperty('--safe-area-inset-top','" + topPx + "px');" +
                "document.documentElement.style.setProperty('--safe-area-inset-bottom','" + bottomPx + "px');";
            v.post(() -> webView.evaluateJavascript(js, null));
            return insets;
        });
        ViewCompat.requestApplyInsets(webView);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Handle notification tap when the activity is already running (singleTask)
        handleNotificationIntent(intent);
    }

    /**
     * If the intent has a data URI from a notification tap, navigate the
     * WebView to the corresponding path (e.g., /notifications).
     */
    private void handleNotificationIntent(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data != null && "eranos.fund".equals(data.getHost())) {
            String path = data.getPath();
            if (path != null && !path.isEmpty()) {
                // Wait for WebView to be ready, then navigate
                getBridge().getWebView().post(() -> {
                    getBridge().getWebView().evaluateJavascript(
                        "window.location.pathname = '" + path.replace("'", "\\'") + "';",
                        null
                    );
                });
            }
        }
    }
}
