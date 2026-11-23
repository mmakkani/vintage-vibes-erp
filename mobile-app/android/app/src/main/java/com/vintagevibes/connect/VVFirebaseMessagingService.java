package com.vintagevibes.connect;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class VVFirebaseMessagingService extends FirebaseMessagingService {

    public static final String PREFS_NAME = "vv_native_prefs";
    public static final String KEY_FCM_TOKEN = "fcm_token";

    public static String getSavedToken(Context ctx) {
        if (ctx == null) return "";
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String val = sp.getString(KEY_FCM_TOKEN, "");
            return val != null ? val : "";
        } catch (Exception ignored) {
            return "";
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        try {
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_FCM_TOKEN, token)
                .apply();
        } catch (Exception ignored) {}
        try {
            PushNotificationsPlugin.onNewToken(token);
        } catch (Exception ignored) {}
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Map<String, String> data = remoteMessage.getData();
        String kind = data != null ? data.get("kind") : "";
        String title = data != null ? data.get("title") : null;
        String body = data != null ? data.get("body") : null;
        if (title == null && remoteMessage.getNotification() != null) {
            title = remoteMessage.getNotification().getTitle();
        }
        if (body == null && remoteMessage.getNotification() != null) {
            body = remoteMessage.getNotification().getBody();
        }

        if ("call".equals(kind) || "group_call".equals(kind)) {
            String callId = data.get("callId");
            String callerName = data.get("callerName");
            if (callerName == null || callerName.isEmpty()) callerName = title;
            String mode = data.get("mode");
            String fromPhone = data.get("fromPhone");
            String groupId = data.get("groupId");
            VVCallNotificationHelper.showIncomingCall(getApplicationContext(), callId, callerName, mode, fromPhone, groupId);
        } else {
            String fromPhone = data != null ? data.get("fromPhone") : "";
            String groupId = data != null ? data.get("groupId") : "";
            VVCallNotificationHelper.showChatMessage(getApplicationContext(), title, body, fromPhone, groupId);
        }

        try {
            PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
        } catch (Exception ignored) {}
    }
}
