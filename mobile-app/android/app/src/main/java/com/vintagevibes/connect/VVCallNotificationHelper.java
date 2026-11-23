package com.vintagevibes.connect;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

public class VVCallNotificationHelper {

    public static final String CALL_CHANNEL_ID = "vv_incoming_calls_v1";
    public static final String MSG_CHANNEL_ID = "vv_messages_v1";
    public static final int CALL_NOTIF_ID = 9001;
    public static final String ACTION_DISMISS_CALL = "com.vintagevibes.connect.ACTION_DISMISS_CALL";

    public static void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || ctx == null) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (nm.getNotificationChannel(CALL_CHANNEL_ID) == null) {
            Uri ringUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            AudioAttributes audioAttrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            NotificationChannel callCh = new NotificationChannel(
                CALL_CHANNEL_ID,
                "Incoming Voice & Video Calls",
                NotificationManager.IMPORTANCE_HIGH
            );
            callCh.setDescription("Full-screen ringtone alerts for incoming VV Connect calls");
            callCh.setSound(ringUri, audioAttrs);
            callCh.enableVibration(true);
            callCh.setVibrationPattern(new long[] { 0, 600, 350, 600, 350, 600 });
            callCh.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            callCh.setBypassDnd(true);
            nm.createNotificationChannel(callCh);
        }

        if (nm.getNotificationChannel(MSG_CHANNEL_ID) == null) {
            NotificationChannel msgCh = new NotificationChannel(
                MSG_CHANNEL_ID,
                "Chats & Voice Notes",
                NotificationManager.IMPORTANCE_HIGH
            );
            msgCh.setDescription("New message, group chat, and voice note alerts");
            msgCh.enableVibration(true);
            msgCh.setVibrationPattern(new long[] { 0, 180, 90, 180 });
            msgCh.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
            nm.createNotificationChannel(msgCh);
        }
    }

    private static int pendingIntentFlags() {
        return PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
    }

    public static void showIncomingCall(
        Context ctx,
        String callId,
        String callerName,
        String mode,
        String fromPhone,
        String groupId
    ) {
        if (ctx == null) return;
        ensureChannels(ctx);

        try {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "VVConnect:IncomingCallWake");
                wl.acquire(3000L);
            }
        } catch (Exception ignored) {}

        String safeCaller = (callerName != null && !callerName.trim().isEmpty()) ? callerName.trim() : "VV Connect Call";
        String safeMode = "video".equalsIgnoreCase(mode) ? "video" : "audio";
        String bodyText = "video".equals(safeMode) ? "Incoming HD Video Call — Tap to Answer" : "Incoming Audio Call — Tap to Answer";

        Intent answerIntent = new Intent(ctx, MainActivity.class);
        answerIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        answerIntent.putExtra("vvAction", "answer_call");
        answerIntent.putExtra("callId", callId != null ? callId : "");
        answerIntent.putExtra("callerName", safeCaller);
        answerIntent.putExtra("mode", safeMode);
        answerIntent.putExtra("fromPhone", fromPhone != null ? fromPhone : "");
        answerIntent.putExtra("groupId", groupId != null ? groupId : "");

        PendingIntent answerPi = PendingIntent.getActivity(ctx, 90011, answerIntent, pendingIntentFlags());

        Intent declineIntent = new Intent(ctx, VVCallActionReceiver.class);
        declineIntent.setAction(ACTION_DISMISS_CALL);
        PendingIntent declinePi = PendingIntent.getBroadcast(ctx, 90012, declineIntent, pendingIntentFlags());

        Uri ringUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CALL_CHANNEL_ID)
            .setSmallIcon(ctx.getApplicationInfo().icon)
            .setContentTitle(safeCaller)
            .setContentText(bodyText)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSound(ringUri)
            .setVibrate(new long[] { 0, 600, 350, 600, 350, 600 })
            .setOngoing(true)
            .setAutoCancel(false)
            .setTimeoutAfter(45000L)
            .setFullScreenIntent(answerPi, true)
            .setContentIntent(answerPi)
            .addAction(0, "Answer", answerPi)
            .addAction(0, "Decline", declinePi);

        Notification notif = b.build();
        notif.flags |= Notification.FLAG_INSISTENT;

        try {
            NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
            if (nm.areNotificationsEnabled()) {
                nm.notify(CALL_NOTIF_ID, notif);
            }
        } catch (SecurityException ignored) {}
    }

    public static void cancelIncomingCall(Context ctx) {
        if (ctx == null) return;
        try {
            NotificationManagerCompat.from(ctx).cancel(CALL_NOTIF_ID);
        } catch (Exception ignored) {}
    }

    public static void showChatMessage(
        Context ctx,
        String title,
        String body,
        String fromPhone,
        String groupId
    ) {
        if (ctx == null) return;
        ensureChannels(ctx);

        Intent openIntent = new Intent(ctx, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        openIntent.putExtra("vvAction", "open_chat");
        openIntent.putExtra("fromPhone", fromPhone != null ? fromPhone : "");
        openIntent.putExtra("groupId", groupId != null ? groupId : "");

        PendingIntent openPi = PendingIntent.getActivity(ctx, 91001, openIntent, pendingIntentFlags());

        String safeTitle = (title != null && !title.trim().isEmpty()) ? title : "VV Connect";
        String safeBody = (body != null && !body.trim().isEmpty()) ? body : "New message received";
        int notifId = 9100 + Math.abs((fromPhone != null ? fromPhone : safeTitle).hashCode()) % 500;

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, MSG_CHANNEL_ID)
            .setSmallIcon(ctx.getApplicationInfo().icon)
            .setContentTitle(safeTitle)
            .setContentText(safeBody)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(safeBody))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(openPi);

        try {
            NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
            if (nm.areNotificationsEnabled()) {
                nm.notify(notifId, b.build());
            }
        } catch (SecurityException ignored) {}
    }
}
