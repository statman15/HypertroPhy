package com.statman15.hypertrophy

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.wear.remote.interactions.RemoteActivityHelper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.launch
import com.google.android.gms.wearable.DataItem
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.tasks.await
import org.json.JSONObject

/** Phone state, protocol v1 (see PLAN.md "Phase 9"). */
data class Routine(val id: String, val name: String)

data class SSet(val label: String, val w: Double, val r: Int, val done: Boolean)
data class SItem(val name: String, val timed: Boolean, val wStep: Double, val rStep: Int, val sets: List<SSet>)

data class WState(
    val units: String = "lb",
    val items: List<SItem> = emptyList(),
    val curI: Int = -1,
    val curJ: Int = -1,
    val active: Boolean,
    val routines: List<Routine> = emptyList(),
    val name: String = "",
    val started: Long = 0,
    val exercise: String = "",
    val set: String = "",
    val target: String = "",
    val timed: Boolean = false,
    val restEnd: Long = 0,
    val holdEnd: Long = 0,
    val done: Int = 0,
    val total: Int = 0,
    val next: String? = null,
)

fun parseState(json: String): WState? = try {
    val o = JSONObject(json)
    val rs = o.optJSONArray("routines")
    WState(
        active = o.optBoolean("active"),
        routines = (0 until (rs?.length() ?: 0)).map { rs!!.getJSONObject(it).let { r -> Routine(r.getString("id"), r.optString("name")) } },
        name = o.optString("name"), started = o.optLong("started"),
        exercise = o.optString("exercise"), set = o.optString("set"), target = o.optString("target"),
        timed = o.optBoolean("timed"), restEnd = o.optLong("restEnd"), holdEnd = o.optLong("holdEnd"),
        done = o.optInt("done"), total = o.optInt("total"),
        next = if (o.isNull("next")) null else o.optString("next"),
        units = o.optString("units", "lb"),
        items = o.optJSONArray("items")?.let { a -> (0 until a.length()).map { k -> a.getJSONObject(k).let { it2 ->
            val ss = it2.getJSONArray("sets")
            SItem(it2.optString("name"), it2.optBoolean("timed"), it2.optDouble("wStep", 5.0), it2.optInt("rStep", 1),
                (0 until ss.length()).map { m -> ss.getJSONObject(m).let { x -> SSet(x.optString("label"), x.optDouble("w"), x.optInt("r"), x.optBoolean("done")) } })
        } } } ?: emptyList(),
        curI = o.optJSONObject("cur")?.optInt("i", -1) ?: -1, curJ = o.optJSONObject("cur")?.optInt("j", -1) ?: -1,
    )
} catch (e: Exception) { null }

object Store {
    /** null = nothing received from the phone yet (shows "Not connected"). */
    val state = MutableStateFlow<WState?>(null)
    val bpm = MutableStateFlow(0)
    val hrSupported = MutableStateFlow(true)

    private val scope = CoroutineScope(Dispatchers.Default)
    private const val TAG = "HypertroPhy"

    /** A routine tapped while the phone app may not be running: re-sent once when the phone app comes up idle. */
    private var pendingStart: String? = null
    private var pendingAt = 0L
    private var remoteOpened = false
    /** True while we wait for the phone app to open (shows "Opening HypertroPhy on your phone…"). */
    val opening = MutableStateFlow(false)

    fun onItem(ctx: Context, item: DataItem) {
        val map = com.google.android.gms.wearable.DataMapItem.fromDataItem(item).dataMap
        val s = parseState(map.getString("json") ?: return) ?: return
        state.value = s
        val id = pendingStart ?: return
        if (s.active || System.currentTimeMillis() - pendingAt > 60_000) { pendingStart = null; opening.value = false }
        else if (remoteOpened) {
            pendingStart = null; opening.value = false
            scope.launch { action(ctx, "start", ",\"routineId\":\"$id\"") }
        }
    }

    suspend fun load(ctx: Context) {
        try {
            Wearable.getDataClient(ctx).dataItems.await().use { buf ->
                buf.firstOrNull { it.uri.path == "/hypertrophy/state" }?.let { onItem(ctx, it) }
            }
        } catch (e: Exception) { Log.d(TAG, "load failed: $e") }
    }

    suspend fun send(ctx: Context, path: String, json: String) {
        try {
            val client = Wearable.getMessageClient(ctx)
            val nodes = Wearable.getNodeClient(ctx).connectedNodes.await()
            Log.d(TAG, "send $path to ${nodes.size} node(s)")
            for (n in nodes) client.sendMessage(n.id, path, json.toByteArray()).await()
        } catch (e: Exception) { Log.d(TAG, "send $path failed: $e") }
    }

    suspend fun action(ctx: Context, type: String, extra: String = "") =
        send(ctx, "/hypertrophy/action", "{\"type\":\"$type\"$extra}")

    /** Tap on a routine / Empty workout: send start; if the phone app doesn't answer with an active state in ~3 s, open it. */
    fun start(ctx: Context, routineId: String) {
        val at = System.currentTimeMillis()
        pendingStart = routineId; pendingAt = at; remoteOpened = false
        scope.launch {
            action(ctx, "start", ",\"routineId\":\"$routineId\"")
            delay(3000)
            if (pendingStart != routineId || pendingAt != at) return@launch
            opening.value = true; remoteOpened = true
            try {
                val i = Intent(Intent.ACTION_VIEW).addCategory(Intent.CATEGORY_BROWSABLE).setData(Uri.parse("hypertrophy://open"))
                RemoteActivityHelper(ctx).startRemoteActivity(i).await()
                Log.d(TAG, "asked the phone to open the app")
            } catch (e: Exception) { Log.d(TAG, "open on phone failed: $e"); opening.value = false }
            delay(60_000)
            if (pendingAt == at) { pendingStart = null; opening.value = false }
        }
    }
}
