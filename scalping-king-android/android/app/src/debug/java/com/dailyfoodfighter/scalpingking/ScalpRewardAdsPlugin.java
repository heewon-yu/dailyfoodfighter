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
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

@CapacitorPlugin(name = "ScalpRewardAds")
public class ScalpRewardAdsPlugin extends Plugin {
    private static final long MAX_AD_AGE_MS = 50 * 60_000L;

    private final Handler main = new Handler(Looper.getMainLooper());
    private RewardedAd ad;
    private PluginCall showing;
    private boolean initializing;
    private boolean initialized;
    private boolean loading;
    private boolean destroyed;
    private long loadedAt;
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
            ad = null;
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
        if (!"credit".equals(feature) && !"emergency".equals(feature) && !"stop".equals(feature)) {
            call.reject("Unknown reward feature");
            return;
        }
        main.post(() -> showOnMain(call));
    }

    private JSObject availability() {
        JSObject result = new JSObject();
        result.put("ready", ad != null && showing == null && !destroyed && !privacyBusy && canRequestAds());
        result.put("privacyRequired", privacyRequired());
        result.put("privacyBusy", privacyBusy);
        return result;
    }

    private void announceAvailability() {
        if (!destroyed) notifyListeners("availabilityChanged", availability());
    }

    private void preload() {
        if (destroyed || !initialized || loading || showing != null || privacyBusy || !canRequestAds()) return;
        if (ad != null && SystemClock.elapsedRealtime() - loadedAt < MAX_AD_AGE_MS) return;
        ad = null;
        loading = true;
        announceAvailability();
        int requestEpoch = consentEpoch;
        RewardedAd.load(getContext(), BuildConfig.SCALP_REWARDED_ID, new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
            @Override
            public void onAdLoaded(@NonNull RewardedAd loaded) {
                if (destroyed) return;
                loading = false;
                if (requestEpoch != consentEpoch || privacyBusy || !canRequestAds()) {
                    preload();
                    return;
                }
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
        if (destroyed || showing != null || ad == null || activity == null || privacyBusy || !canRequestAds() ||
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
