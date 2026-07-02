package fund.eranos.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor bridge for the Tor (arti) mode.
 *
 * <p>Mirrors {@link DittoNotificationPlugin}'s pattern: JS configures native
 * state, native owns the work. On a cold launch arti auto-starts from
 * {@link MainActivity} based on the persisted flag. At runtime the settings
 * toggle activates Tor live via {@link #start}/{@link #stop}, which start or
 * stop arti immediately and update the persisted flag. ({@link #setEnabled}
 * persists the flag only, without touching the running proxy.) Live bootstrap
 * status is pushed to JS via the {@code torStatus} event.
 *
 * <p>JS interface: see {@code src/lib/tor.ts}.
 */
@CapacitorPlugin(name = "Tor")
public class TorPlugin extends Plugin {

    private static final String EVENT_STATUS = "torStatus";

    @Override
    public void load() {
        // Forward native status changes to JS listeners. Attaching also replays
        // the current status, keeping a newly-mounted JS gate in sync.
        TorController.getInstance().setListener((status, bootstrapPercent, error, exitIp) -> {
            JSObject data = new JSObject();
            data.put("status", status);
            data.put("bootstrapPercent", bootstrapPercent);
            data.put("error", error);
            data.put("exitIp", exitIp);
            notifyListeners(EVENT_STATUS, data);
        });
    }

    /** Whether Tor is enabled in persisted preferences. */
    @PluginMethod
    public void isEnabled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", TorController.isEnabled(getContext()));
        call.resolve(ret);
    }

    /**
     * Persist the enabled flag only, without starting or stopping arti now.
     * Controls whether arti auto-starts on the next cold launch. For live
     * activation use {@link #start}/{@link #stop}.
     */
    @PluginMethod
    public void setEnabled(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) {
            call.reject("Missing 'enabled' boolean");
            return;
        }
        TorController.setEnabled(getContext(), enabled);
        call.resolve();
    }

    /** Start arti now (live activation). Also persists enabled=true so it
     *  auto-starts on the next cold launch. */
    @PluginMethod
    public void start(PluginCall call) {
        TorController.setEnabled(getContext(), true);
        TorController.getInstance().start(getContext());
        call.resolve();
    }

    /** Stop arti now (live deactivation) and clear the WebView proxy. Also
     *  persists enabled=false. */
    @PluginMethod
    public void stop(PluginCall call) {
        TorController.setEnabled(getContext(), false);
        TorController.getInstance().stop();
        call.resolve();
    }

    /** Current connection status (synchronous snapshot). */
    @PluginMethod
    public void getStatus(PluginCall call) {
        TorController controller = TorController.getInstance();
        JSObject ret = new JSObject();
        ret.put("enabled", TorController.isEnabled(getContext()));
        ret.put("status", controller.getStatus());
        ret.put("bootstrapPercent", controller.getBootstrapPercent());
        ret.put("error", controller.getError());
        ret.put("exitIp", controller.getExitIp());
        call.resolve(ret);
    }

    /** Re-run the connectivity probe (for a "Retry" action in the gate). */
    @PluginMethod
    public void retry(PluginCall call) {
        TorController.getInstance().retry();
        call.resolve();
    }
}
