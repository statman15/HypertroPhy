package com.statman15.hypertrophy;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

// Foreground service while a workout is active: keeps the process (and the Galaxy Watch MessageClient listener) out of the frozen cached state.
public class WorkoutKeepAlive extends Service {
    @Override
    public IBinder onBind(Intent i) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel("workout", "Workout in progress", NotificationManager.IMPORTANCE_LOW));
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, "workout")
            .setSmallIcon(R.drawable.ic_stat_dumbbell)
            .setContentTitle(intent != null ? intent.getStringExtra("title") : "Workout")
            .setContentText(intent != null ? intent.getStringExtra("text") : "")
            .setOngoing(true).setContentIntent(open).build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(7, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(7, n);
        return START_NOT_STICKY;
    }
}
