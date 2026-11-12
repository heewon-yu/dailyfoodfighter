package com.dailyfoodfighter.scalpingking;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.IOException;
import java.io.InputStream;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class BundledGameTest {
    @Test
    public void appHasOfflineGameAssets() throws IOException {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.dailyfoodfighter.scalpingking", app.getPackageName());

        String[] files = {"index.html", "style.css", "game.js", "chart.js", "market.js",
            "engine-v2.js", "ledger-v2.js", "microstructure-v2.js", "risk-v2.js", "reward-v2.js", "android-reward.js"};
        for (String file : files) {
            try (InputStream asset = app.getAssets().open("public/" + file)) {
                assertTrue(file + " is empty", asset.read() >= 0);
            }
        }
    }
}
