package com.provisit.provisit;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(NativePdfPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
