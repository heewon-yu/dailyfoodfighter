package com.dailyfoodfighter.scalpingking;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        AdPlugins.register(this);
        super.onCreate(savedInstanceState);
    }
}
