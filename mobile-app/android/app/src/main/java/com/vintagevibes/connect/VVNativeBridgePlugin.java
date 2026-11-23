package com.vintagevibes.connect;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;

@CapacitorPlugin(
    name = "VVNativeBridge",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications"),
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone"),
        @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera"),
        @Permission(strings = { Manifest.permission.READ_CONTACTS }, alias = "contacts"),
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, alias = "location")
    }
)
public class VVNativeBridgePlugin extends Plugin {

    public static volatile JSObject pendingLaunchData = null;

    public static void setPendingLaunchIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getStringExtra("vvAction");
        if (action == null || action.isEmpty()) return;
        JSObject obj = new JSObject();
        obj.put("action", action);
        obj.put("callId", intent.getStringExtra("callId") != null ? intent.getStringExtra("callId") : "");
        obj.put("callerName", intent.getStringExtra("callerName") != null ? intent.getStringExtra("callerName") : "");
        obj.put("mode", intent.getStringExtra("mode") != null ? intent.getStringExtra("mode") : "audio");
        obj.put("fromPhone", intent.getStringExtra("fromPhone") != null ? intent.getStringExtra("fromPhone") : "");
        obj.put("groupId", intent.getStringExtra("groupId") != null ? intent.getStringExtra("groupId") : "");
        pendingLaunchData = obj;
    }

    private String permStateToStr(PermissionState st) {
        if (st == null) return "prompt";
        return st.toString();
    }

    private boolean hasFirebaseConfig(Context ctx) {
        try {
            return ctx.getResources().getIdentifier("google_app_id", "string", ctx.getPackageName()) != 0;
        } catch (Exception ignored) {
            return false;
        }
    }

    private JSObject buildStatusObject() {
        Context ctx = getContext();
        boolean osNotifs = false;
        try {
            osNotifs = NotificationManagerCompat.from(ctx).areNotificationsEnabled();
        } catch (Exception ignored) {}

        String notifStr;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            notifStr = osNotifs ? "granted" : "denied";
        } else {
            PermissionState nState = getPermissionState("notifications");
            notifStr = (nState == PermissionState.GRANTED && !osNotifs) ? "denied" : permStateToStr(nState);
        }

        JSObject ret = new JSObject();
        ret.put("notifications", notifStr);
        ret.put("microphone", permStateToStr(getPermissionState("microphone")));
        ret.put("camera", permStateToStr(getPermissionState("camera")));
        ret.put("contacts", permStateToStr(getPermissionState("contacts")));
        ret.put("location", permStateToStr(getPermissionState("location")));
        ret.put("osNotificationsEnabled", osNotifs);
        ret.put("hasFirebase", hasFirebaseConfig(ctx));
        ret.put("androidSdk", Build.VERSION.SDK_INT);
        ret.put("keepAliveRunning", VVKeepAliveService.isRunning);
        ret.put("pendingFcmToken", VVFirebaseMessagingService.getSavedToken(ctx));
        return ret;
    }

    @PluginMethod
    public void getNativeStatus(PluginCall call) {
        call.resolve(buildStatusObject());
    }

    @PluginMethod
    public void requestAllCorePermissions(PluginCall call) {
        ArrayList<String> needed = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("notifications") != PermissionState.GRANTED) {
            needed.add("notifications");
        }
        String[] others = new String[] { "microphone", "camera", "contacts", "location" };
        for (String alias : others) {
            if (getPermissionState(alias) != PermissionState.GRANTED) {
                needed.add(alias);
            }
        }
        if (needed.isEmpty()) {
            call.resolve(buildStatusObject());
            return;
        }
        requestPermissionForAliases(needed.toArray(new String[0]), call, "onPermissionsCallback");
    }

    @PluginMethod
    public void requestSinglePermission(PluginCall call) {
        String alias = call.getString("alias", "");
        if (alias == null || alias.isEmpty()) {
            call.reject("Missing permission alias");
            return;
        }
        if ("notifications".equals(alias) && Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve(buildStatusObject());
            return;
        }
        if (
            !"notifications".equals(alias) &&
            !"microphone".equals(alias) &&
            !"camera".equals(alias) &&
            !"contacts".equals(alias) &&
            !"location".equals(alias)
        ) {
            call.reject("Unsupported alias: " + alias);
            return;
        }
        requestPermissionForAliases(new String[] { alias }, call, "onPermissionsCallback");
    }

    @PermissionCallback
    private void onPermissionsCallback(PluginCall call) {
        call.resolve(buildStatusObject());
    }

    @PluginMethod
    public void openAppNotificationSettings(PluginCall call) {
        Context ctx = getContext();
        try {
            Intent intent = new Intent();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent.setAction(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
            } else {
                intent.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.fromParts("package", ctx.getPackageName(), null));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                fallback.setData(Uri.fromParts("package", ctx.getPackageName(), null));
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(fallback);
                call.resolve();
            } catch (Exception e2) {
                call.reject("Could not open Android settings: " + e2.getMessage());
            }
        }
    }

    @PluginMethod
    public void showIncomingCall(PluginCall call) {
        VVCallNotificationHelper.showIncomingCall(
            getContext(),
            call.getString("callId", ""),
            call.getString("callerName", "VV Connect"),
            call.getString("mode", "audio"),
            call.getString("fromPhone", ""),
            call.getString("groupId", "")
        );
        call.resolve();
    }

    @PluginMethod
    public void cancelIncomingCall(PluginCall call) {
        VVCallNotificationHelper.cancelIncomingCall(getContext());
        call.resolve();
    }

    @PluginMethod
    public void showChatNotification(PluginCall call) {
        VVCallNotificationHelper.showChatMessage(
            getContext(),
            call.getString("title", "VV Connect"),
            call.getString("body", "New message"),
            call.getString("fromPhone", ""),
            call.getString("groupId", "")
        );
        call.resolve();
    }

    @PluginMethod
    public void startKeepAlive(PluginCall call) {
        Context ctx = getContext();
        try {
            Intent svc = new Intent(ctx, VVKeepAliveService.class);
            ContextCompat.startForegroundService(ctx, svc);
            JSObject ret = new JSObject();
            ret.put("started", true);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("started", false);
            ret.put("error", e.getMessage());
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void stopKeepAlive(PluginCall call) {
        try {
            getContext().stopService(new Intent(getContext(), VVKeepAliveService.class));
        } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void getLaunchAction(PluginCall call) {
        JSObject res = new JSObject();
        res.put("pending", pendingLaunchData);
        call.resolve(res);
    }

    @PluginMethod
    public void clearLaunchAction(PluginCall call) {
        pendingLaunchData = null;
        call.resolve();
    }
}
