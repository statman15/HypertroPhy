package com.statman15.hypertrophy

import android.content.Context
import com.google.android.gms.wearable.DataItem
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.tasks.await
import org.json.JSONObject

/** Phone state, protocol v1 (see PLAN.md "Phase 9"). */
data class Routine(val id: String, val name: String)

data class WState(
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
    )
} catch (e: Exception) { null }

object Store {
    /** null = nothing received from the phone yet (shows "Not connected"). */
    val state = MutableStateFlow<WState?>(null)
    val bpm = MutableStateFlow(0)
    val hrSupported = MutableStateFlow(true)

    fun onItem(item: DataItem) {
        val map = com.google.android.gms.wearable.DataMapItem.fromDataItem(item).dataMap
        parseState(map.getString("json") ?: return)?.let { state.value = it }
    }

    suspend fun load(ctx: Context) {
        try {
            Wearable.getDataClient(ctx).dataItems.await().use { buf ->
                buf.firstOrNull { it.uri.path == "/hypertrophy/state" }?.let { onItem(it) }
            }
        } catch (e: Exception) { }
    }

    suspend fun send(ctx: Context, path: String, json: String) {
        try {
            val client = Wearable.getMessageClient(ctx)
            for (n in Wearable.getNodeClient(ctx).connectedNodes.await())
                client.sendMessage(n.id, path, json.toByteArray()).await()
        } catch (e: Exception) { }
    }

    suspend fun action(ctx: Context, type: String, extra: String = "") =
        send(ctx, "/hypertrophy/action", "{\"type\":\"$type\"$extra}")
}
