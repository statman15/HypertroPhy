package com.statman15.hypertrophy

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val Orange = Color(0xFFFF8A4C)
private val DeepOrange = Color(0xFFC2410C)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(colors = Colors(primary = DeepOrange, secondary = Orange, background = Color.Black, surface = Color(0xFF1C1917), onPrimary = Color.White, onSecondary = Color.Black, onBackground = Color.White, onSurface = Color.White)) {
                App()
            }
        }
    }
}

private fun buzz(ctx: Context) {
    val v = ctx.getSystemService(Vibrator::class.java)
    v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 400, 150, 400, 150, 700), -1))
}

private fun fmt(ms: Long): String {
    val s = (ms.coerceAtLeast(0) + 999) / 1000
    return "%d:%02d".format(s / 60, s % 60)
}

@Composable
fun App() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val state by Store.state.collectAsState()
    val bpm by Store.bpm.collectAsState()
    val hrOk by Store.hrSupported.collectAsState()
    val active = state?.active == true

    fun startHr() {
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED)
            ContextCompat.startForegroundService(ctx, Intent(ctx, WorkoutService::class.java))
    }
    val perms = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { startHr() }

    LaunchedEffect(Unit) {
        Store.load(ctx)
        Store.send(ctx, "/hypertrophy/hello", "{}")
    }
    // Start the HR session when a workout becomes active (the service ends itself when it stops being active).
    LaunchedEffect(active) {
        if (active) perms.launch(arrayOf(Manifest.permission.BODY_SENSORS, Manifest.permission.ACTIVITY_RECOGNITION, Manifest.permission.POST_NOTIFICATIONS))
    }

    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        val s = state
        when {
            s == null -> Msg("Not connected", "Open HypertroPhy on your phone")
            !s.active -> Idle(s) { id -> scope.launch { Store.action(ctx, "start", ",\"routineId\":\"$id\"") } }
            else -> Active(s, if (hrOk) bpm else -1) { type, extra -> scope.launch { Store.action(ctx, type, extra) } }
        }
    }
}

@Composable
fun Msg(title: String, body: String) {
    androidx.compose.foundation.layout.Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, color = Orange, fontWeight = FontWeight.Bold, fontSize = 18.sp, textAlign = TextAlign.Center)
        Text(body, textAlign = TextAlign.Center, fontSize = 14.sp)
    }
}

@Composable
fun Idle(s: WState, start: (String) -> Unit) {
    ScalingLazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        item { Text("Start workout", color = Orange, fontWeight = FontWeight.Bold) }
        items(s.routines.size) { i ->
            val r = s.routines[i]
            Chip(label = { Text(r.name, maxLines = 2) }, onClick = { start(r.id) }, modifier = Modifier.fillMaxWidth(0.9f), colors = ChipDefaults.secondaryChipColors())
        }
        item { Chip(label = { Text("Empty workout") }, onClick = { start("empty") }, modifier = Modifier.fillMaxWidth(0.9f), colors = ChipDefaults.primaryChipColors()) }
    }
}

@Composable
fun Active(s: WState, bpm: Int, act: (String, String) -> Unit) {
    val ctx = LocalContext.current
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var confirm by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { while (true) { now = System.currentTimeMillis(); delay(250) } }
    // Strong vibration when this rest period reaches zero (only if it ends while we're watching).
    LaunchedEffect(s.restEnd) {
        if (s.restEnd > 0) {
            val wait = s.restEnd - System.currentTimeMillis()
            if (wait in 1..600_000) { delay(wait); buzz(ctx) }
        }
    }
    val resting = s.restEnd > now
    val holding = s.holdEnd > now

    ScalingLazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        item { Text(fmt(now - s.started).let { if ((now - s.started) >= 3_600_000) "%d:%02d:%02d".format((now - s.started) / 3_600_000, (now - s.started) / 60_000 % 60, (now - s.started) / 1000 % 60) else it } + (if (bpm >= 0) "  ♥ " + (if (bpm > 0) bpm else "--") else ""), color = Orange, fontSize = 14.sp) }
        item { Text(s.exercise, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 2) }
        item { Text(s.set + (if (s.target.isNotEmpty()) " · " + s.target else ""), textAlign = TextAlign.Center, fontSize = 13.sp) }
        if (resting) {
            item { Text("Rest " + fmt(s.restEnd - now), color = Orange, fontSize = 30.sp, fontWeight = FontWeight.Bold) }
            item { Chip(label = { Text("Skip rest") }, onClick = { act("skipRest", "") }, modifier = Modifier.fillMaxWidth(0.9f), colors = ChipDefaults.primaryChipColors()) }
            item { Chip(label = { Text("+15 s") }, onClick = { act("addRest", ",\"seconds\":15") }, modifier = Modifier.fillMaxWidth(0.9f), colors = ChipDefaults.secondaryChipColors()) }
        } else if (holding) {
            item { Text("Hold " + fmt(s.holdEnd - now), color = Orange, fontSize = 30.sp, fontWeight = FontWeight.Bold) }
        } else {
            item { Button(onClick = { act("setDone", "") }, modifier = Modifier.padding(vertical = 4.dp), colors = ButtonDefaults.primaryButtonColors()) { Text(if (s.timed) "Start" else "Set done", fontWeight = FontWeight.Bold, fontSize = 13.sp, textAlign = TextAlign.Center) } }
        }
        item { Text("${s.done} / ${s.total} sets" + (s.next?.let { " · next: $it" } ?: ""), fontSize = 11.sp, textAlign = TextAlign.Center) }
        if (confirm) {
            item { Text("Finish workout?", fontWeight = FontWeight.Bold) }
            item { Chip(label = { Text("Yes, finish") }, onClick = { confirm = false; act("finish", "") }, modifier = Modifier.fillMaxWidth(0.9f), colors = ChipDefaults.primaryChipColors()) }
            item { Chip(label = { Text("Cancel") }, onClick = { confirm = false }, modifier = Modifier.fillMaxWidth(0.9f), colors = ChipDefaults.secondaryChipColors()) }
        } else {
            item { Chip(label = { Text("Finish") }, onClick = { confirm = true }, modifier = Modifier.fillMaxWidth(0.9f), colors = ChipDefaults.secondaryChipColors()) }
        }
    }
}
