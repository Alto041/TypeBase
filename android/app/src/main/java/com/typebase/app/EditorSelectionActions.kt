package com.typebase.app

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.view.inputmethod.InputConnection
import android.R

object EditorSelectionActions {
  enum class Action {
    SELECT_ALL,
    COPY,
    PASTE,
    CUT,
  }

  fun actionForShiftLetter(letter: Char): Action? =
      when (letter.lowercaseChar()) {
        'a' -> Action.SELECT_ALL
        'c' -> Action.COPY
        'v' -> Action.PASTE
        'x' -> Action.CUT
        else -> null
      }

  fun perform(context: Context, connection: InputConnection, action: Action): Boolean {
    return when (action) {
      Action.SELECT_ALL -> connection.performContextMenuAction(R.id.selectAll)
      Action.COPY -> copySelection(context, connection)
      Action.PASTE -> pasteClipboard(context, connection)
      Action.CUT -> cutSelection(context, connection)
    }
  }

  fun copySelection(context: Context, connection: InputConnection): Boolean {
    val selected = connection.getSelectedText(0)?.toString().orEmpty()
    if (selected.isEmpty()) {
      return false
    }
    val manager =
        context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    manager.setPrimaryClip(ClipData.newPlainText("text", selected))
    return true
  }

  fun cutSelection(context: Context, connection: InputConnection): Boolean {
    val selected = connection.getSelectedText(0)?.toString().orEmpty()
    if (selected.isEmpty()) {
      return false
    }
    val manager =
        context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    manager.setPrimaryClip(ClipData.newPlainText("text", selected))
    connection.commitText("", 1)
    return true
  }

  fun pasteClipboard(context: Context, connection: InputConnection): Boolean {
    if (connection.performContextMenuAction(R.id.paste)) {
      return true
    }
    val manager =
        context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    val clip = manager.primaryClip
    if (clip == null || clip.itemCount == 0) {
      return false
    }
    val text = clip.getItemAt(0).coerceToText(context)?.toString()?.takeIf { it.isNotEmpty() }
    if (text == null) {
      return false
    }
    connection.commitText(text, 1)
    return true
  }

  fun selectAll(connection: InputConnection): Boolean =
      connection.performContextMenuAction(R.id.selectAll)
}
