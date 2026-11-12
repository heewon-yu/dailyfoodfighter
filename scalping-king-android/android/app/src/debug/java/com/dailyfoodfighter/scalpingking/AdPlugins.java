package com.dailyfoodfighter.scalpingking;

import com.getcapacitor.BridgeActivity;

final class AdPlugins {
    private AdPlugins() {}

    static void register(BridgeActivity activity) {
        activity.registerPlugin(ScalpRewardAdsPlugin.class);
    }
}
