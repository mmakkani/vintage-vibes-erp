package com.vintagevibes.connect;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class VVCallActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        if (VVCallNotificationHelper.ACTION_DISMISS_CALL.equals(intent.getAction())) {
            VVCallNotificationHelper.cancelIncomingCall(context);
        }
    }
}
