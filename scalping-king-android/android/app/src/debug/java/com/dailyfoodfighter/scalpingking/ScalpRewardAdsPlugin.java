package com.dailyfoodfighter.scalpingking;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
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

@CapacitorPlugin(name = "ScalpRewardAds")
public class ScalpRewardAdsPlugin extends Plugin {
    private static final String TEST_UNIT = "ca-app-pub-3940256099942544/5224354917";
    private static final long MAX_AD_AGE_MS = 50 * 60_000L;

    private final Handler main = new Handler(Looper.getMainLooper());
    private RewardedAd ad;
    private PluginCall showing;
    private boolean initializing;
    private boolean initialized;
    private boolean loading;
    private boolean destroyed;
    private long loadedAt;

    @PluginMethod
    public void prepare(PluginCall call) {
        main.post(() -> {
            call.resolve(availability());
            if (initialized) {
                preload();
            } else if (!initializing && !destroyed) {
                initializing = true;
                new Thread(() -> MobileAds.initialize(getContext().getApplicationContext(), status ->
                    main.post(() -> {
                        if (destroyed) return;
                        initialized = true;
                        preload();
                    })
                ), "scalping-ad-init").start();
            }
        });
    }

    @PluginMethod
    public void show(PluginCall call) {
        String feature = call.getString("feature", "");
        if (!"credit".equals(feature) && !"emergency".equals(feature) && !"stop".equals(feature)) {
            call.reject("Unknown reward feature");
            return;
        }
        main.post(() -> showOnMain(call));
    }

    private JSObject availability() {
        JSObject result = new JSObject();
        result.put("ready", ad != null && showing == null && !destroyed);
        return result;
    }

    private void announceAvailability() {
        if (!destroyed) notifyListeners("availabilityChanged", availability());
    }

    private void preload() {
        if (destroyed || !initialized || loading || showing != null) return;
        if (ad != null && SystemClock.elapsedRealtime() - loadedAt < MAX_AD_AGE_MS) return;
        ad = null;
        loading = true;
        announceAvailability();
        RewardedAd.load(getContext(), TEST_UNIT, new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
            @Override
            public void onAdLoaded(@NonNull RewardedAd loaded) {
                if (destroyed) return;
                loading = false;
                ad = loaded;
                loadedAt = SystemClock.elapsedRealtime();
                announceAvailability();
            }

            @Override
            public void onAdFailedToLoad(@NonNull LoadAdError error) {
                if (destroyed) return;
                loading = false;
                announceAvailability();
                main.postDelayed(ScalpRewardAdsPlugin.this::preload, 20_000);
            }
        });
    }

    private void showOnMain(PluginCall call) {
        Activity activity = getActivity();
        if (destroyed || showing != null || ad == null || activity == null ||
            activity.isFinishing() || activity.isDestroyed() ||
            SystemClock.elapsedRealtime() - loadedAt >= MAX_AD_AGE_MS) {
            resolve(call, false);
            preload();
            return;
        }

        RewardedAd selected = ad;
        ad = null;
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
        ad = null;
        if (showing != null) {
            resolve(showing, false);
            showing = null;
        }
        super.handleOnDestroy();
    }
}
