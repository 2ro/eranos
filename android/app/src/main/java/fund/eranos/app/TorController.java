package fund.eranos.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.webkit.ProxyConfig;
import androidx.webkit.ProxyController;
import androidx.webkit.WebViewFeature;

import org.json.JSONException;
import org.json.JSONObject;

import java.net.InetSocketAddress;
import java.net.Proxy;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.torproject.arti.ArtiProxy;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/**
 * Process-wide controller for the optional Tor (arti) mode on Android.
 *
 * <p>When enabled, this starts a local SOCKS5 proxy backed by arti (Tor in
 * Rust) and — via {@link ArtiProxy.ArtiProxyBuilder#setWrapWebView(boolean)} —
 * installs an Android {@code ProxyController} override so that <em>all</em>
 * Capacitor WebView traffic (every {@code fetch} and relay {@code WebSocket})
 * is routed through Tor. No changes to the TypeScript HTTP layer are needed.
 *
 * <p>The enabled flag is persisted to {@link SharedPreferences} by
 * {@link TorPlugin} and read here at startup from {@link MainActivity}, so arti
 * auto-starts on a cold launch <em>before</em> the WebView loads — there is no
 * pre-bootstrap leak window. Beyond that, activation is live: the settings
 * toggle calls {@link #start}/{@link #stop} (bridged through {@link TorPlugin}),
 * which start or stop arti immediately while also updating the persisted flag.
 *
 * <p>Pluggable transports (obfs4 via IPtProxy) are intentionally not wired up
 * yet — the builder already exposes {@code setObfs4Port}/{@code setBridgeLines}
 * for a future censorship-resistance layer.
 */
public class TorController {

    private static final String TAG = "TorController";

    /** Local SOCKS5 port arti listens on (arti's own default). */
    public static final int SOCKS_PORT = 9150;

    static final String PREFS_NAME = "tor_config";
    static final String KEY_ENABLED = "enabled";

    /** Endpoint used to confirm a working Tor circuit (small JSON response). */
    private static final String PROBE_URL = "https://check.torproject.org/api/ip";
    // Re-verify continuously (gently) so the status reflects current reality.
    private static final long PROBE_INTERVAL_SECONDS = 10;
    /** After this long without a successful probe, surface a soft "failed". */
    private static final long SOFT_TIMEOUT_SECONDS = 120;

    // Status values mirrored to JS (see src/lib/tor.ts TorStatus).
    public static final String STATUS_DISABLED = "disabled";
    public static final String STATUS_CONNECTING = "connecting";
    public static final String STATUS_CONNECTED = "connected";
    public static final String STATUS_FAILED = "failed";

    /** Receives status changes so the Capacitor plugin can forward them to JS. */
    public interface StatusListener {
        void onTorStatus(String status, int bootstrapPercent, @Nullable String error, @Nullable String exitIp);
    }

    private static volatile TorController instance;

    private final Object lock = new Object();
    private final AtomicBoolean started = new AtomicBoolean(false);

    private ArtiProxy artiProxy;
    private ScheduledExecutorService scheduler;

    private volatile String status = STATUS_DISABLED;
    private volatile int bootstrapPercent = 0;
    @Nullable private volatile String error = null;
    /** Tor exit-node IP from the last successful check (for verification UI). */
    @Nullable private volatile String exitIp = null;
    /** Consecutive failed probes; used to debounce CONNECTED -> reconnecting. */
    private int consecutiveFailures = 0;
    @Nullable private volatile StatusListener listener;
    private volatile long startedAtMs = 0;

    private TorController() {}

    public static TorController getInstance() {
        if (instance == null) {
            synchronized (TorController.class) {
                if (instance == null) {
                    instance = new TorController();
                }
            }
        }
        return instance;
    }

    /** Whether Tor is enabled in persisted preferences (read at cold-launch startup). */
    public static boolean isEnabled(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getBoolean(KEY_ENABLED, false);
    }

    /**
     * Persist the enabled flag only. This controls whether arti auto-starts on
     * the next cold launch; it does not start or stop arti now. For live
     * activation call {@link #start}/{@link #stop}, which also persist the flag.
     */
    public static void setEnabled(Context context, boolean enabled) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_ENABLED, enabled)
                .apply();
    }

    public void setListener(@Nullable StatusListener listener) {
        this.listener = listener;
        // Replay the current status so a freshly-attached listener is in sync.
        if (listener != null) {
            listener.onTorStatus(status, bootstrapPercent, error, exitIp);
        }
    }

    public String getStatus() {
        return status;
    }

    public int getBootstrapPercent() {
        return bootstrapPercent;
    }

    @Nullable
    public String getError() {
        return error;
    }

    @Nullable
    public String getExitIp() {
        return exitIp;
    }

    /**
     * Start arti and install the WebView proxy override. Idempotent: a second
     * call while already running is a no-op. Heavy work runs off the caller's
     * thread so this is safe to invoke from {@code MainActivity.onCreate}.
     */
    public void start(Context context) {
        if (!started.compareAndSet(false, true)) {
            return;
        }
        final Context appContext = context.getApplicationContext();
        exitIp = null;
        consecutiveFailures = 0;
        // Install the fail-closed WebView proxy override synchronously, BEFORE
        // the WebView loads (start() is called from MainActivity.onCreate ahead
        // of super.onCreate). With no direct fallback, any request that arti
        // can't carry fails instead of leaking out directly — even during the
        // bootstrap window when arti isn't connected yet.
        applyWebViewProxy();
        updateStatus(STATUS_CONNECTING, 0, null);
        startedAtMs = System.currentTimeMillis();

        Thread t = new Thread(() -> {
            try {
                synchronized (lock) {
                    // NB: we do NOT use setWrapWebView(true) — arti's helper
                    // appends a DIRECT fallback (fail-open). We set our own
                    // fail-closed override in applyWebViewProxy() instead.
                    artiProxy = ArtiProxy.Builder(appContext)
                            .setSocksPort(SOCKS_PORT)
                            .setLogListener(this::onArtiLog)
                            .build();
                    artiProxy.start();
                }
                Log.d(TAG, "arti started on socks://127.0.0.1:" + SOCKS_PORT);
                beginConnectivityProbe();
            } catch (Throwable e) {
                Log.e(TAG, "Failed to start arti", e);
                updateStatus(STATUS_FAILED, bootstrapPercent, String.valueOf(e.getMessage()));
            }
        }, "arti-start");
        t.setDaemon(true);
        t.start();
    }

    /** Stop arti and route the WebView back to a direct connection. Safe to
     *  call live (toggle off) — clears the SOCKS proxy override so traffic
     *  doesn't get stranded on the now-stopped proxy. */
    public void stop() {
        // Remove the WebView SOCKS override first so new requests go direct.
        clearWebViewProxy();
        synchronized (lock) {
            if (scheduler != null) {
                scheduler.shutdownNow();
                scheduler = null;
            }
            if (artiProxy != null) {
                try {
                    artiProxy.stop();
                } catch (Throwable e) {
                    Log.w(TAG, "Error stopping arti", e);
                }
                artiProxy = null;
            }
        }
        started.set(false);
        exitIp = null;
        updateStatus(STATUS_DISABLED, 0, null);
    }

    /** Re-run the connectivity probe (used by a "Retry" action in the gate). */
    public void retry() {
        if (!started.get()) {
            return;
        }
        consecutiveFailures = 0;
        startedAtMs = System.currentTimeMillis();
        if (!STATUS_CONNECTED.equals(status)) {
            updateStatus(STATUS_CONNECTING, bootstrapPercent, null);
        }
        beginConnectivityProbe();
    }

    // --- internals -------------------------------------------------------

    /**
     * Route the WebView through arti's SOCKS proxy, FAIL-CLOSED. There is no
     * {@code addDirect()} fallback, so when Tor can't carry a request it fails
     * rather than leaking to a direct connection. localhost is bypassed (it's
     * the local Capacitor asset server, never remote traffic).
     */
    private void applyWebViewProxy() {
        try {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
                ProxyConfig config = new ProxyConfig.Builder()
                        .addProxyRule("socks://127.0.0.1:" + SOCKS_PORT)
                        // No addDirect() — fail closed.
                        .addBypassRule("localhost")
                        .addBypassRule("127.0.0.1")
                        .build();
                ProxyController.getInstance().setProxyOverride(config, Runnable::run, () -> {});
            }
        } catch (Throwable e) {
            Log.w(TAG, "Error applying WebView proxy override", e);
        }
    }

    /** Remove the app-wide WebView SOCKS proxy override so the WebView reverts
     *  to a direct connection. */
    private void clearWebViewProxy() {
        try {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
                ProxyController.getInstance().clearProxyOverride(Runnable::run, () -> {});
            }
        } catch (Throwable e) {
            Log.w(TAG, "Error clearing WebView proxy override", e);
        }
    }

    private static final Pattern PERCENT = Pattern.compile("(\\d{1,3})\\s*%");

    private void onArtiLog(String line) {
        if (line == null) return;
        Log.d("artilog", line);
        // Best-effort bootstrap progress for the UI. arti's log format isn't a
        // stable API, so the connectivity probe (below) remains authoritative
        // for the definitive "connected" signal.
        Matcher m = PERCENT.matcher(line);
        if (m.find()) {
            try {
                int pct = Integer.parseInt(m.group(1));
                if (pct >= 0 && pct <= 100 && pct >= bootstrapPercent
                        && !STATUS_CONNECTED.equals(status)) {
                    updateStatus(STATUS_CONNECTING, pct, null);
                }
            } catch (NumberFormatException ignored) {
            }
        }
    }

    private void beginConnectivityProbe() {
        synchronized (lock) {
            if (scheduler != null) {
                scheduler.shutdownNow();
            }
            scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
                Thread th = new Thread(r, "tor-probe");
                th.setDaemon(true);
                return th;
            });
            final ScheduledExecutorService s = scheduler;
            final OkHttpClient client = new OkHttpClient.Builder()
                    .proxy(new Proxy(Proxy.Type.SOCKS, new InetSocketAddress("127.0.0.1", SOCKS_PORT)))
                    .connectTimeout(20, TimeUnit.SECONDS)
                    .readTimeout(20, TimeUnit.SECONDS)
                    .build();

            // Probe continuously (no shutdown on success). check.torproject.org
            // reports whether the request actually exited via Tor, so we only
            // report CONNECTED when IsTor is true — and we keep re-verifying so a
            // dropped circuit downgrades the status instead of lying.
            s.scheduleWithFixedDelay(() -> {
                Request req = new Request.Builder()
                        .url(PROBE_URL)
                        .header("Accept", "application/json")
                        .build();
                try (Response resp = client.newCall(req).execute()) {
                    String body = resp.body() != null ? resp.body().string() : "";
                    boolean isTor = false;
                    String ip = null;
                    try {
                        JSONObject json = new JSONObject(body);
                        isTor = json.optBoolean("IsTor", false);
                        ip = json.has("IP") ? json.optString("IP", null) : null;
                    } catch (JSONException ignored) {
                        // Non-JSON response — treat as not-via-Tor below.
                    }

                    if (resp.isSuccessful() && isTor) {
                        consecutiveFailures = 0;
                        exitIp = ip;
                        updateStatus(STATUS_CONNECTED, 100, null);
                    } else if (resp.isSuccessful()) {
                        // Reached the internet but NOT through Tor — a leak/bypass.
                        // This should not happen with the SOCKS proxy, but report
                        // it honestly rather than claiming a Tor connection.
                        consecutiveFailures = 0;
                        exitIp = ip;
                        updateStatus(STATUS_FAILED, bootstrapPercent,
                                "Connected to the internet, but not through Tor.");
                    } else {
                        handleProbeFailure();
                    }
                } catch (Exception e) {
                    handleProbeFailure();
                }
            }, 0, PROBE_INTERVAL_SECONDS, TimeUnit.SECONDS);
        }
    }

    /** A probe couldn't reach Tor. Debounce CONNECTED, surface FAILED after the
     *  soft timeout while still connecting. */
    private void handleProbeFailure() {
        consecutiveFailures++;
        if (STATUS_CONNECTED.equals(status)) {
            // Tolerate a couple of transient blips before downgrading.
            if (consecutiveFailures >= 3) {
                exitIp = null;
                updateStatus(STATUS_CONNECTING, bootstrapPercent,
                        "Lost the Tor circuit; reconnecting…");
            }
            return;
        }
        long elapsed = (System.currentTimeMillis() - startedAtMs) / 1000;
        if (elapsed >= SOFT_TIMEOUT_SECONDS && !STATUS_FAILED.equals(status)) {
            updateStatus(STATUS_FAILED, bootstrapPercent,
                    "Couldn't reach the Tor network. Your network may be blocking Tor.");
        }
    }

    private void updateStatus(String newStatus, int percent, @Nullable String err) {
        this.status = newStatus;
        this.bootstrapPercent = percent;
        this.error = err;
        StatusListener l = this.listener;
        if (l != null) {
            l.onTorStatus(newStatus, percent, err, exitIp);
        }
    }
}
