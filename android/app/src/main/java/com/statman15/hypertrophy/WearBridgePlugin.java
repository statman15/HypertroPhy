package com.statman15.hypertrophy;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.wearable.DataClient;
import com.google.android.gms.wearable.MessageClient;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.PutDataRequest;
import com.google.android.gms.wearable.Wearable;
import java.nio.charset.StandardCharsets;

// Phone side of the Galaxy Watch link (protocol in PLAN.md, Phase 9). Every call fails quietly with no watch or Play services.
@CapacitorPlugin(name = "WearBridge")
public class WearBridgePlugin extends Plugin {
    private final MessageClient.OnMessageReceivedListener listener = this::onMessage;
    private MessageClient messages;

    @Override
    public void load() {
        try {
            messages = Wearable.getMessageClient(getContext());
            messages.addListener(listener);
        } catch (Throwable ignored) {
            messages = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (messages != null) messages.removeListener(listener);
        } catch (Throwable ignored) {
        }
    }

    private void onMessage(MessageEvent ev) {
        try {
            String path = ev.getPath();
            if ("/hypertrophy/hello".equals(path)) {
                notifyListeners("hello", new JSObject());
                return;
            }
            JSObject data = new JSObject(new String(ev.getData(), StandardCharsets.UTF_8));
            if ("/hypertrophy/action".equals(path)) notifyListeners("action", data);
            else if ("/hypertrophy/hr".equals(path)) notifyListeners("hr", data);
        } catch (Throwable ignored) {
        }
    }

    @PluginMethod
    public void pushState(PluginCall call) {
        try {
            PutDataMapRequest req = PutDataMapRequest.create("/hypertrophy/state");
            req.getDataMap().putString("json", call.getString("json", ""));
            req.getDataMap().putLong("t", System.currentTimeMillis());
            PutDataRequest put = req.asPutDataRequest().setUrgent();
            DataClient data = Wearable.getDataClient(getContext());
            data.putDataItem(put).addOnFailureListener(e -> { });
        } catch (Throwable ignored) {
        }
        call.resolve();
    }

    // Starts/updates the keep-alive foreground service while a workout is active, stops it otherwise.
    @PluginMethod
    public void setWorkout(PluginCall call) {
        try {
            Intent i = new Intent(getContext(), WorkoutKeepAlive.class);
            if (Boolean.TRUE.equals(call.getBoolean("active", false))) {
                i.putExtra("title", call.getString("title", "Workout"));
                i.putExtra("text", call.getString("text", ""));
                getContext().startForegroundService(i); // throws from the background on Android 12+; retried on the next foreground push
            } else {
                getContext().stopService(i);
            }
        } catch (Throwable ignored) {
        }
        call.resolve();
    }
}
