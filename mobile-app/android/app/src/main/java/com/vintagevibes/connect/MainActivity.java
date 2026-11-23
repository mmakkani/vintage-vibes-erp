package com.vintagevibes.connect;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VVNativeBridgePlugin.class);
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }

        try {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                this.bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
            }
        } catch (Exception ignored) {}

        VVCallNotificationHelper.ensureChannels(this);
        VVNativeBridgePlugin.setPendingLaunchIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        VVNativeBridgePlugin.setPendingLaunchIntent(intent);
        if (this.bridge != null) {
            this.bridge.triggerWindowJSEvent("vvNativeLaunchAction");
        }
    }
}
