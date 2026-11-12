package com.dailyfoodfighter.scalpingking;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import androidx.annotation.NonNull;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.gms.ads.rewarded.ServerSideVerificationOptions;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

@CapacitorPlugin(name = "ScalpRewardAds")
public class ScalpRewardAdsPlugin extends Plugin {
    private static final long MAX_AD_AGE_MS = 50 * 60_000L;

    private final Handler main = new Handler(Looper.getMainLooper());
    private static final Map<String, String> UNITS = new HashMap<>();
    static {
        UNITS.put("credit", BuildConfig.SCALP_REWARDED_ID);
        UNITS.put("emergency", BuildConfig.SCALP_EMERGENCY_ID);
        UNITS.put("stop", BuildConfig.SCALP_STOP_ID);
        UNITS.put("extra", BuildConfig.SCALP_EXTRA_ID);
    }
    private final Map<String, RewardedAd> ads = new HashMap<>();
    private final Map<String, Long> loadedAt = new HashMap<>();
    private final Set<String> loading = new HashSet<>();
    private PluginCall showing;
    private boolean initializing;
    private boolean initialized;
    private boolean destroyed;
    private ConsentInformation consent;
    private boolean consentStarted;
    private boolean privacyBusy;
    private int consentEpoch;

    @PluginMethod
    public void prepare(PluginCall call) {
        main.post(() -> {
            call.resolve(availability());
            if (BuildConfig.DEBUG) prepareAds();
            else requestConsent();
        });
    }


    private void requestConsent() {
        if (consentStarted || destroyed) return;
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) return;
        consentStarted = true;
        consent = UserMessagingPlatform.getConsentInformation(getContext());
        consent.requestConsentInfoUpdate(activity, new ConsentRequestParameters.Builder().build(), () -> {
            if (destroyed) return;
            setPrivacyBusy(true);
            UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity, error -> finishPrivacy());
        }, error -> finishPrivacy());
    }

    private boolean privacyRequired() {
        return consent != null && consent.getPrivacyOptionsRequirementStatus() ==
            ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED;
    }

    @PluginMethod
    public void openPrivacyOptions(PluginCall call) {
        main.post(() -> {
            Activity activity = getActivity();
            if (destroyed || privacyBusy || showing != null || !privacyRequired() ||
                activity == null || activity.isFinishing() || activity.isDestroyed()) {
                call.reject("Privacy options are unavailable");
                return;
            }
            setPrivacyBusy(true);
            UserMessagingPlatform.showPrivacyOptionsForm(activity, error -> {
                finishPrivacy();
                if (error == null) call.resolve();
                else call.reject("Could not open privacy options");
            });
        });
    }

    private void setPrivacyBusy(boolean busy) {
        privacyBusy = busy;
        if (busy) {
            ads.clear();
            loadedAt.clear();
            consentEpoch++;
        }
        announceAvailability();
    }

    private void finishPrivacy() {
        if (destroyed) return;
        setPrivacyBusy(false);
        prepareAds();
    }

    private boolean canRequestAds() {
        return BuildConfig.DEBUG || (consent != null && consent.canRequestAds());
    }

    private void prepareAds() {
        if (destroyed || privacyBusy || !canRequestAds()) return;
        if (initialized) {
            preload();
        } else if (!initializing) {
            initializing = true;
            new Thread(() -> MobileAds.initialize(getContext().getApplicationContext(), status ->
                main.post(() -> {
                    if (destroyed) return;
                    initialized = true;
                    preload();
                })
            ), "scalping-ad-init").start();
        }
    }

    @PluginMethod
    public void show(PluginCall call) {
        String feature = call.getString("feature", "");
        if (!UNITS.containsKey(feature) || UNITS.get(feature).isEmpty()) {
            call.reject("Unknown reward feature");
            return;
        }
        main.post(() -> showOnMain(call, UNITS.get(feature)));
    }

    private JSObject availability() {
        JSObject result = new JSObject();
        JSONArray features = new JSONArray();
        if (showing == null && !destroyed && !privacyBusy && canRequestAds()) {
            UNITS.forEach((feature, unit) -> { if (isFresh(unit)) features.put(feature); });
        }
        result.put("ready", features.length() > 0);
        result.put("features", features);
        result.put("serverVerifiedOnly", !BuildConfig.DEBUG);
        result.put("privacyRequired", privacyRequired());
        result.put("privacyBusy", privacyBusy);
        return result;
    }

    private void announceAvailability() {
        if (!destroyed) notifyListeners("availabilityChanged", availability());
    }

    private boolean isFresh(String unit) {
        return ads.containsKey(unit) && SystemClock.elapsedRealtime() - loadedAt.get(unit) < MAX_AD_AGE_MS;
    }

    private void preload() {
        if (destroyed || !initialized || showing != null || privacyBusy || !canRequestAds()) return;
        for (String unit : new HashSet<>(UNITS.values())) if (!unit.isEmpty()) preloadUnit(unit);
    }

    private void preloadUnit(String unit) {
        if (isFresh(unit) || !loading.add(unit)) return;
        ads.remove(unit);
        loadedAt.remove(unit);
        int epoch = consentEpoch;
        RewardedAd.load(getContext(), unit, new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
            @Override
            public void onAdLoaded(@NonNull RewardedAd loaded) {
                loading.remove(unit);
                if (destroyed) return;
                if (epoch != consentEpoch || privacyBusy || !canRequestAds()) {
                    preload();
                    return;
                }
                ads.put(unit, loaded);
                loadedAt.put(unit, SystemClock.elapsedRealtime());
                announceAvailability();
            }

            @Override
            public void onAdFailedToLoad(@NonNull LoadAdError error) {
                loading.remove(unit);
                if (destroyed) return;
                announceAvailability();
                main.postDelayed(ScalpRewardAdsPlugin.this::preload, 20_000);
            }
        });
    }

    private void showOnMain(PluginCall call, String unit) {
        Activity activity = getActivity();
        String nonce = call.getString("nonce", "");
        if (destroyed || showing != null || !isFresh(unit) || activity == null || privacyBusy || !canRequestAds() ||
            activity.isFinishing() || activity.isDestroyed() ||
            (!BuildConfig.DEBUG && !nonce.matches("[0-9a-fA-F-]{36}"))) {
            resolve(call, false);
            preload();
            return;
        }

        RewardedAd selected = ads.remove(unit);
        loadedAt.remove(unit);
        if (!nonce.isEmpty()) {
            selected.setServerSideVerificationOptions(new ServerSideVerificationOptions.Builder().setCustomData(nonce).build());
        }
        showing = call;
        announceAvailability();
        class AdCallbacks extends FullScreenContentCallback {
            private boolean earned;

            @Override
            public void onAdDismissedFullScreenContent() {
                finish(call, earned);
            }

            @Override
            public void onAdFailedToShowFullScreenContent(@NonNull AdError error) {
                finish(call, false);
            }

            void markEarned() {
                if (showing == call) earned = true;
            }

            void display() {
                try {
                    selected.show(activity, reward -> markEarned());
                } catch (RuntimeException error) {
                    finish(call, false);
                }
            }
        }
        AdCallbacks callbacks = new AdCallbacks();
        selected.setFullScreenContentCallback(callbacks);
        callbacks.display();
    }

    private void finish(PluginCall call, boolean earned) {
        if (showing != call) return;
        showing = null;
        resolve(call, earned);
        preload();
    }

    private void resolve(PluginCall call, boolean earned) {
        JSObject result = new JSObject();
        result.put("earned", earned);
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        destroyed = true;
        main.removeCallbacksAndMessages(null);
        ads.clear();
        loadedAt.clear();
        if (showing != null) {
            resolve(showing, false);
            showing = null;
        }
        super.handleOnDestroy();
    }
}
