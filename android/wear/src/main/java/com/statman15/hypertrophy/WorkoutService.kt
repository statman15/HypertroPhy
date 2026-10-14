package com.statman15.hypertrophy

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import androidx.health.services.client.data.SampleDataPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.guava.await

/** Foreground service that owns the Health Services strength-training session and streams HR to the phone. */
class WorkoutService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var lastSent = 0L

    private val callback = object : ExerciseUpdateCallback {
        override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
            val p = update.latestMetrics.getData(DataType.HEART_RATE_BPM).lastOrNull() as? SampleDataPoint<Double> ?: return
            val bpm = p.value.toInt()
            Store.bpm.value = bpm
            Store.addHr(bpm)
            val now = System.currentTimeMillis()
            if (now - lastSent >= 5000) {
                lastSent = now
                scope.launch { Store.send(applicationContext, "/hypertrophy/hr", "{\"bpm\":$bpm,\"t\":$now}") }
            }
        }
        override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) {}
        override fun onRegistered() {}
        override fun onRegistrationFailed(throwable: Throwable) {}
        override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) {}
    }

    override fun onBind(i: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("workout", "Workout", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(this, "workout")
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentTitle("HypertroPhy workout")
            .setContentText("Recording heart rate")
            .setOngoing(true).setContentIntent(open).build()
        startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH)

        val client = HealthServices.getClient(this).exerciseClient
        scope.launch {
            try {
                val caps = client.getCapabilitiesAsync().await()
                val ok = caps.getExerciseTypeCapabilities(ExerciseType.STRENGTH_TRAINING).supportedDataTypes.contains(DataType.HEART_RATE_BPM)
                Store.hrSupported.value = ok
                if (ok) {
                    client.setUpdateCallback(callback)
                    client.startExerciseAsync(ExerciseConfig(ExerciseType.STRENGTH_TRAINING, setOf(DataType.HEART_RATE_BPM), false, false)).await()
                }
                // Run until the phone says the workout is over.
                Store.state.first { it?.active != true }
            } catch (e: Exception) {
                Store.hrSupported.value = false
            } finally {
                try { client.endExerciseAsync().await() } catch (e: Exception) { }
                Store.bpm.value = 0
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() { scope.cancel() }
}
