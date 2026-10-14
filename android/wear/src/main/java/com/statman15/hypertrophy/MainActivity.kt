package com.statman15.hypertrophy

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.wear.compose.material.SwipeToDismissBox
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val Orange = Color(0xFFFF8A4C)
private val DeepOrange = Color(0xFFC2410C)

class MainActivity : ComponentActivity() {
    // Idle screen resumes (or app opens): ask the phone to re-push state.
    override fun onResume() {
        super.onResume()
        lifecycleScope.launch { Store.send(applicationContext, "/hypertrophy/hello", "{}") }
    }

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
    return if (s >= 3600) "%d:%02d:%02d".format(s / 3600, s / 60 % 60, s % 60) else "%d:%02d".format(s / 60, s % 60)
}

private fun nf(d: Double) = if (d == Math.floor(d)) d.toLong().toString() else "%.1f".format(d)

/** Swiping up (about 80 px) runs onUp. onUp must only write Compose state: the gesture handler is created once. */
private fun Modifier.swipeUp(onUp: () -> Unit) = pointerInput(Unit) {
    awaitEachGesture { // watches the Initial pass without consuming, so a swipe that starts on a button still counts
        val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        var total = 0f
        while (true) {
            val c = awaitPointerEvent(PointerEventPass.Initial).changes.firstOrNull { it.id == down.id } ?: break
            if (!c.pressed) break
            total += c.position.y - c.previousPosition.y
        }
        if (total < -80f) onUp()
    }
}

/** A sub-screen: swipe right (or the back button) goes back. */
@Composable
fun Dismissable(onBack: () -> Unit, content: @Composable () -> Unit) {
    BackHandler(onBack = onBack)
    SwipeToDismissBox(onDismissed = onBack) { isBackground -> if (!isBackground) content() }
}

/** The pill button used for the main action of a screen. */
@Composable
private fun Pill(text: String, primary: Boolean = true, onClick: () -> Unit) {
    Button(onClick, Modifier.fillMaxWidth(0.66f).height(40.dp), colors = if (primary) ButtonDefaults.primaryButtonColors() else ButtonDefaults.secondaryButtonColors()) {
        Text(text, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1)
    }
}

private enum class Screen { MAIN, PLAN, CONFIRM }

@Composable
fun App() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val state by Store.state.collectAsState()
    val bpm by Store.bpm.collectAsState()
    val hr by Store.hr.collectAsState()
    val hrOk by Store.hrSupported.collectAsState()
    val opening by Store.opening.collectAsState()
    val active = state?.active == true
    var sel by remember { mutableStateOf<String?>(null) } // routine whose overview is open

    fun startHr() {
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED)
            ContextCompat.startForegroundService(ctx, Intent(ctx, WorkoutService::class.java))
    }
    val perms = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { startHr() }

    LaunchedEffect(Unit) {
        Store.load(ctx)
    }
    // Start the HR session when a workout becomes active (the service ends itself when it stops being active).
    LaunchedEffect(active) {
        if (active) {
            sel = null
            perms.launch(arrayOf(Manifest.permission.BODY_SENSORS, Manifest.permission.ACTIVITY_RECOGNITION, Manifest.permission.POST_NOTIFICATIONS))
        }
    }

    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        val s = state
        when {
            s == null -> Msg("Not connected", "Open HypertroPhy on your phone")
            !s.active && opening -> Msg("Opening HypertroPhy", "Opening HypertroPhy on your phone…")
            !s.active -> {
                val r = s.routines.firstOrNull { it.id == sel }
                if (r != null) Dismissable({ sel = null }) { Overview(s, r) { Store.start(ctx, r.id) } }
                else Idle(s, { sel = it }) { Store.start(ctx, "empty") }
            }
            else -> Active(s, if (hrOk) bpm else -1, hr) { type, extra -> scope.launch { Store.action(ctx, type, extra) } }
        }
    }
}

@Composable
fun Msg(title: String, body: String) {
    Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, color = Orange, fontWeight = FontWeight.Bold, fontSize = 18.sp, textAlign = TextAlign.Center)
        Text(body, textAlign = TextAlign.Center, fontSize = 14.sp)
    }
}

@Composable
fun Idle(s: WState, open: (String) -> Unit, startEmpty: () -> Unit) {
    ScalingLazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        item { Text("Start workout", color = Orange, fontWeight = FontWeight.Bold) }
        items(s.routines.size) { i ->
            val r = s.routines[i]
            Chip(label = { Text(r.name, maxLines = 2) }, onClick = { open(r.id) }, modifier = Modifier.fillMaxWidth(0.9f), colors = ChipDefaults.secondaryChipColors())
        }
        item { Chip(label = { Text("Empty workout") }, onClick = startEmpty, modifier = Modifier.fillMaxWidth(0.9f), colors = ChipDefaults.primaryChipColors()) }
    }
}

/** Routine preview: each exercise with sets × reps and the suggested weight; Start at the bottom. */
@Composable
fun Overview(s: WState, r: Routine, start: () -> Unit) {
    ScalingLazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        item { Text(r.name, color = Orange, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 2, modifier = Modifier.fillMaxWidth(0.7f)) }
        if (r.items.isEmpty()) item { Text("No exercises", fontSize = 13.sp) }
        items(r.items.size) { k ->
            val x = r.items[k]
            val sup = x.ss || r.items.getOrNull(k - 1)?.ss == true
            Column(Modifier.fillMaxWidth(0.8f), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(x.name, fontWeight = FontWeight.Bold, fontSize = 14.sp, textAlign = TextAlign.Center, maxLines = 2)
                Text((if (sup) "SS · " else "") + "${x.sets} × ${x.reps}" + (if (x.w > 0) " · ${nf(x.w)} ${s.units}" else ""),
                    fontSize = 12.sp, color = if (sup) Orange else Color.LightGray, textAlign = TextAlign.Center)
            }
        }
        item { Pill("Start", onClick = start) }
    }
}

@Composable
fun Active(s: WState, bpm: Int, hr: Store.HrStats, act: (String, String) -> Unit) {
    val ctx = LocalContext.current
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var screen by remember { mutableStateOf(Screen.MAIN) }
    var view by remember { mutableStateOf<Pair<Int, Int>?>(null) } // set picked from the plan, until it is done
    LaunchedEffect(Unit) { while (true) { now = System.currentTimeMillis(); delay(250) } }
    // Strong vibration when this rest period reaches zero (only if it ends while we're watching).
    LaunchedEffect(s.restEnd) {
        if (s.restEnd > 0) {
            val wait = s.restEnd - System.currentTimeMillis()
            if (wait in 1..600_000) { delay(wait); buzz(ctx) }
        }
    }
    val cur = if (s.curI >= 0) s.curI to s.curJ else null
    val v = view?.takeIf { it != cur && s.items.getOrNull(it.first)?.sets?.getOrNull(it.second)?.done == false }
    val holding = s.holdEnd > 0 && now < s.holdEnd + 1500 // the phone logs the hold a moment after it ends
    val resting = s.restEnd > now && cur != null && v == null
    val openPlan = { screen = Screen.PLAN }

    when (screen) {
        Screen.PLAN -> Dismissable({ screen = Screen.MAIN }) {
            Plan(s, { i ->
                val j = s.items[i].sets.indexOfFirst { !it.done }
                if (j >= 0) { view = if (i to j == cur) null else i to j; screen = Screen.MAIN }
            }) { screen = Screen.CONFIRM }
        }
        Screen.CONFIRM -> Dismissable({ screen = Screen.PLAN }) {
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterVertically)) {
                Text("Save workout?", fontWeight = FontWeight.Bold, color = Orange)
                Pill("Yes") { act("finish", "") }
                Pill("Keep going", primary = false) { screen = Screen.PLAN }
            }
        }
        Screen.MAIN -> when {
            holding -> {
                val ex = (v ?: cur)?.let { s.items.getOrNull(it.first) }
                Box(Modifier.fillMaxSize()) {
                    TimeText()
                    Column(Modifier.fillMaxSize().padding(top = 8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        Text(ex?.name ?: s.exercise, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 2, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(0.62f))
                        Text("HOLD", color = Orange, fontSize = 11.sp)
                        Text(fmt(s.holdEnd - now), color = Orange, fontSize = 40.sp, fontWeight = FontWeight.Bold)
                        Spacer4()
                        Pill("Done", primary = false) { act("setDone", "") }
                    }
                }
            }
            cur == null -> Summary(s, now, hr) { screen = Screen.CONFIRM }
            resting -> {
                val ex = s.items.getOrNull(cur.first)
                val x = ex?.sets?.getOrNull(cur.second)
                val next = if (ex == null || x == null) s.exercise else ex.name + " · " + (if (x.label.startsWith("W")) "warm-up ${x.label.drop(1)}" else "set ${x.label}")
                Box(Modifier.fillMaxSize().swipeUp(openPlan)) {
                    TimeText()
                    Column(Modifier.fillMaxSize().padding(top = 14.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        Text("REST", color = Orange, fontSize = 11.sp)
                        Text(fmt(s.restEnd - now), fontSize = 38.sp, fontWeight = FontWeight.Bold)
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                            Button({ act("addRest", ",\"seconds\":-15") }, Modifier.size(40.dp), colors = ButtonDefaults.secondaryButtonColors()) { Text("−15", fontSize = 12.sp, maxLines = 1) }
                            Button({ act("skipRest", "") }, Modifier.width(62.dp).height(40.dp), colors = ButtonDefaults.primaryButtonColors()) { Text("Skip", fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1) }
                            Button({ act("addRest", ",\"seconds\":15") }, Modifier.size(40.dp), colors = ButtonDefaults.secondaryButtonColors()) { Text("+15", fontSize = 12.sp, maxLines = 1) }
                        }
                        Text("Next: $next", fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(0.58f).padding(top = 4.dp))
                    }
                }
            }
            else -> {
                val (i, j) = v ?: cur
                SetScreen(s, i, j, bpm, act, openPlan)
            }
        }
    }
}

@Composable
private fun Spacer4() = Box(Modifier.height(4.dp))

/** One set: weight and reps (seconds for a timed set) with - / +, the bezel changes the weight (seconds when timed), big Finish set. */
@Composable
fun SetScreen(s: WState, i: Int, j: Int, bpm: Int, act: (String, String) -> Unit, openPlan: () -> Unit) {
    val ex = s.items.getOrNull(i)
    val x = ex?.sets?.getOrNull(j)
    if (ex == null || x == null) { // phone without per-set data: plain current-set view
        Column(Modifier.fillMaxSize().swipeUp(openPlan), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text(s.exercise, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 2, modifier = Modifier.fillMaxWidth(0.7f))
            Text(s.set + (if (s.target.isNotEmpty()) " · " + s.target else ""), textAlign = TextAlign.Center, fontSize = 13.sp)
            Pill("✓ Finish set") { act("setDone", "") }
        }
        return
    }
    var w by remember(i, j) { mutableStateOf(x.w) }
    var r by remember(i, j) { mutableStateOf(x.r) }
    val focus = remember { FocusRequester() }
    var acc by remember { mutableStateOf(0f) }
    LaunchedEffect(i, j) { focus.requestFocus() }
    fun bumpW(sign: Int) { w = (w + sign * ex.wStep).coerceIn(0.0, 2000.0) }
    fun bumpR(sign: Int) { r = (r + sign * ex.rStep).coerceIn(1, 3600) }
    fun bump(sign: Int) = if (ex.timed) bumpR(sign) else bumpW(sign)

    val wu = x.label.startsWith("W")
    val same = ex.sets.filter { it.label.startsWith("W") == wu }
    val title = (if (wu) "Warm-up" else "Set") + " ${same.indexOf(x) + 1} of ${same.size}"
    val heart = if (bpm >= 0) " · ♥ " + (if (bpm > 0) bpm else "--") else ""

    Column(
        Modifier.fillMaxSize().swipeUp(openPlan).onRotaryScrollEvent { ev ->
            acc += ev.verticalScrollPixels
            while (acc >= 40f) { bump(1); acc -= 40f }
            while (acc <= -40f) { bump(-1); acc += 40f }
            true
        }.focusRequester(focus).focusable().padding(top = 14.dp, bottom = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
    ) {
        Text(ex.name, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(0.66f))
        Text(title + heart, color = Orange, fontSize = 11.sp, maxLines = 1)
        if (!ex.timed) Stepper("${nf(w)} ${s.units}", { bumpW(-1) }, { bumpW(1) })
        Stepper(if (ex.timed) "$r s" else "$r reps", { bumpR(-1) }, { bumpR(1) })
        Box(Modifier.padding(top = 3.dp)) {
            Pill(if (ex.timed) "Start hold" else "✓ Finish set") {
                act("setDone", ",\"i\":$i,\"j\":$j,\"w\":$w,\"r\":$r" + if (ex.timed) ",\"hold\":true" else "")
            }
        }
        Text("▲ plan", fontSize = 10.sp, color = Color.Gray, modifier = Modifier.clickable { openPlan() }.padding(horizontal = 12.dp, vertical = 2.dp))
    }
}

@Composable
private fun Stepper(label: String, minus: () -> Unit, plus: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Button(onClick = minus, modifier = Modifier.size(34.dp), colors = ButtonDefaults.secondaryButtonColors()) { Text("−", fontSize = 16.sp) }
        Text(label, Modifier.widthIn(min = 78.dp), textAlign = TextAlign.Center, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1)
        Button(onClick = plus, modifier = Modifier.size(34.dp), colors = ButtonDefaults.secondaryButtonColors()) { Text("+", fontSize = 16.sp) }
    }
}

/** Every exercise with how many sets are done; the current one is highlighted; tap to jump; End workout at the bottom. */
@Composable
fun Plan(s: WState, jump: (Int) -> Unit, end: () -> Unit) {
    val list = rememberScalingLazyListState(initialCenterItemIndex = (s.curI + 1).coerceAtLeast(1))
    ScalingLazyColumn(Modifier.fillMaxSize(), state = list, verticalArrangement = Arrangement.spacedBy(4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        item { Text("Plan", color = Orange, fontWeight = FontWeight.Bold) }
        items(s.items.size) { i ->
            val ex = s.items[i]
            val d = ex.sets.count { it.done }
            val sup = ex.ss || s.items.getOrNull(i - 1)?.ss == true
            Chip(
                label = { Text(ex.name, maxLines = 2) },
                secondaryLabel = { Text((if (sup) "SS · " else "") + "$d/${ex.sets.size}" + if (d == ex.sets.size) " ✓" else "") },
                onClick = { jump(i) }, modifier = Modifier.fillMaxWidth(0.9f),
                colors = if (i == s.curI) ChipDefaults.primaryChipColors() else ChipDefaults.secondaryChipColors(),
            )
        }
        item { Chip(label = { Text("End workout") }, onClick = end, modifier = Modifier.fillMaxWidth(0.9f), colors = ChipDefaults.secondaryChipColors()) }
    }
}

/** All sets done: duration, sets, heart rate, Save. */
@Composable
fun Summary(s: WState, now: Long, hr: Store.HrStats, save: () -> Unit) {
    Box(Modifier.fillMaxSize()) {
        TimeText()
        Column(Modifier.fillMaxSize().padding(top = 10.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text("Workout done", color = Orange, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            Text(fmt(now - s.started), fontSize = 34.sp, fontWeight = FontWeight.Bold)
            Text("${s.done} sets", fontSize = 13.sp)
            if (hr.n > 0) Text("♥ ${hr.sum / hr.n} avg · ${hr.max} max", fontSize = 13.sp)
            Box(Modifier.padding(top = 6.dp)) { Pill("Save", onClick = save) }
        }
    }
}
