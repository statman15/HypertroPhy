package com.statman15.hypertrophy;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WearBridgePlugin.class); // local plugin: Galaxy Watch link
        super.onCreate(savedInstanceState);
    }
}
