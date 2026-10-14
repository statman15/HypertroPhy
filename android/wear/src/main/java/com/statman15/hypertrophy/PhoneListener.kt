package com.statman15.hypertrophy

import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.WearableListenerService

/** Keeps Store current even when the UI is closed. */
class PhoneListener : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) {
        for (e in events) if (e.type == DataEvent.TYPE_CHANGED && e.dataItem.uri.path == "/hypertrophy/state") Store.onItem(applicationContext, e.dataItem)
    }
}
