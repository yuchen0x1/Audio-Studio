package com.audiostudio.app.ui.history

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.audiostudio.app.R
import com.audiostudio.app.data.TaskStatus
import com.audiostudio.app.ui.MainViewModel
import com.audiostudio.app.ui.components.Hint
import com.audiostudio.app.ui.components.TaskRow

private enum class HistoryFilter(@StringRes val labelRes: Int) {
    ALL(R.string.history_filter_all), ACTIVE(R.string.history_filter_active), DONE(R.string.history_filter_done), FAILED(R.string.history_filter_failed)
}

@Composable
fun HistoryScreen(vm: MainViewModel, modifier: Modifier = Modifier) {
    val tasks by vm.tasks.collectAsState()
    var query by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf(HistoryFilter.ALL) }

    val filtered = tasks.filter { t ->
        val matchesQuery = query.isBlank() ||
            t.sourceName.contains(query, ignoreCase = true) ||
            (t.outputName?.contains(query, ignoreCase = true) == true) ||
            t.targetFormat.contains(query, ignoreCase = true)
        val matchesFilter = when (filter) {
            HistoryFilter.ALL -> true
            HistoryFilter.ACTIVE -> t.status.isActive
            HistoryFilter.DONE -> t.status == TaskStatus.COMPLETED
            HistoryFilter.FAILED -> t.status == TaskStatus.FAILED || t.status == TaskStatus.CANCELLED
        }
        matchesQuery && matchesFilter
    }

    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(stringResource(R.string.history_title), fontSize = 22.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
            TextButton(onClick = { vm.clearFinished() }) {
                Text(stringResource(R.string.history_clear_completed), fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text(stringResource(R.string.history_search_placeholder), fontSize = 14.sp) },
            singleLine = true,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = MaterialTheme.colorScheme.outline,
                focusedContainerColor = MaterialTheme.colorScheme.surface,
                unfocusedContainerColor = MaterialTheme.colorScheme.surface,
            ),
        )

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            HistoryFilter.entries.forEach { f ->
                val sel = filter == f
                TextButton(onClick = { filter = f }) {
                    Text(
                        stringResource(f.labelRes),
                        color = if (sel) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 13.sp,
                    )
                }
            }
        }

        if (filtered.isEmpty()) {
            Hint(if (tasks.isEmpty()) stringResource(R.string.history_empty) else stringResource(R.string.history_no_match))
        }

        filtered.forEach { t ->
            TaskRow(
                task = t,
                onPause = vm::pause,
                onResume = vm::resume,
                onCancel = vm::cancel,
                onRetry = vm::retry,
                onDelete = vm::deleteTask,
            )
        }
    }
}
