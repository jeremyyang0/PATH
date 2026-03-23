import json
from typing import Any, Dict, List, Optional, Tuple


def _action_call(action: str) -> str:
    if action in {"click", "item_clicked", "item_selection_changed", "combo_activated"}:
        return "click"
    if action in {"right_click"}:
        return "right_click"
    if action in {"double_click", "item_double_clicked", "item_activated"}:
        return "double_click"
    return ""


def _is_item_like_type(type_name: str) -> bool:
    t = str(type_name or "")
    if not t:
        return False
    if t in {
        "QListWidgetItem",
        "QTreeWidgetItem",
        "QTableWidgetItem",
        "QStandardItem",
        "ModelIndexItem",
        "QModelIndexItem",
    }:
        return True
    return t.lower().endswith("item")


def _normalize_index_action_target(target: Dict[str, Any], action: str = "") -> Dict[str, Any]:
    if not isinstance(target, dict):
        return {}
    widget_def = target.get("widget_def")
    if not isinstance(widget_def, dict):
        return target
    if not _is_item_like_type(widget_def.get("type")):
        return target
    container = widget_def.get("container")
    if isinstance(container, dict) and container:
        normalized = dict(target)
        normalized["widget_def"] = container
        return normalized

    item_type = str(widget_def.get("type", ""))
    fallback_view_type_map = {
        "QListWidgetItem": "QListWidget",
        "QTreeWidgetItem": "QTreeWidget",
        "QTableWidgetItem": "QTableWidget",
    }
    fallback_view_type = fallback_view_type_map.get(item_type)
    if not fallback_view_type and action.startswith("combo_") and item_type == "QStandardItem":
        fallback_view_type = "QComboBox"
    if not fallback_view_type:
        return target

    normalized = dict(target)
    normalized["widget_def"] = {"type": fallback_view_type}
    if "name" in widget_def and widget_def.get("name"):
        normalized["widget_def"]["name"] = widget_def.get("name")
    return normalized


def _extract_row_column(value: Dict[str, Any]) -> Tuple[Optional[int], Optional[int]]:
    row = value.get("row")
    column = value.get("column")
    if row is None:
        index_path = value.get("index_path")
        if isinstance(index_path, list) and index_path:
            try:
                row = int(index_path[-1][0])
                column = int(index_path[-1][1])
            except Exception:
                row = None
                column = None
    if row is None:
        return None, None
    try:
        row = int(row)
    except Exception:
        return None, None
    if column is None:
        return row, None
    try:
        return row, int(column)
    except Exception:
        return row, None


def _format_target(target: Dict[str, Any]) -> Optional[Tuple[str, int, Optional[List[int]]]]:
    if not target:
        return None
    widget_def = target.get("widget_def")
    if not isinstance(widget_def, dict) or not widget_def:
        return None
    occurrence = int(target.get("occurrence", 1))
    offset = target.get("offset")
    if isinstance(offset, (list, tuple)) and len(offset) == 2:
        offset = [int(offset[0]), int(offset[1])]
    else:
        offset = None
    return json.dumps(widget_def, ensure_ascii=False), occurrence, offset


def _find_expr(widget_def_json: str, occurrence: int = 1, offset: Optional[List[int]] = None) -> str:
    args = [widget_def_json]
    if int(occurrence or 1) > 1:
        args.append(f"occurrence={int(occurrence)}")
    if isinstance(offset, list) and len(offset) == 2:
        args.append(f"offset={offset}")
    return f"dancemonkey.find_ele_by_attr({', '.join(args)})"


def _emit_click(lines: List[str], action: str, target: Dict[str, Any]):
    target_data = _format_target(target)
    if not target_data:
        return
    widget_def, occurrence, offset = target_data
    lines.append(f"{_find_expr(widget_def, occurrence=occurrence, offset=offset)}.{_action_call(action)}()")


def _canonical_target(target: Dict[str, Any]) -> str:
    if not isinstance(target, dict):
        return ""
    payload = {
        "widget_def": target.get("widget_def") or {},
        "occurrence": int(target.get("occurrence", 1)),
        "offset": target.get("offset") or None,
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def _target_without_offset(target: Dict[str, Any]) -> str:
    if not isinstance(target, dict):
        return ""
    payload = {
        "widget_def": target.get("widget_def") or {},
        "occurrence": int(target.get("occurrence", 1)),
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def _event_priority(event: Dict[str, Any]) -> int:
    action = str(event.get("action", ""))
    value = event.get("value") or {}
    source = str(event.get("source", ""))
    score = 0
    if action.startswith("item_") or action.startswith("combo_") or action.startswith("tab_"):
        score += 20
    if action == "text_changed":
        score += 25
    if source == "signal":
        score += 10
    if "index_path" in value:
        score += 20
    if "row" in value or "column" in value:
        score += 10
    return score


def _event_signature(event: Dict[str, Any]) -> str:
    action = str(event.get("action", ""))
    target = event.get("target") or {}
    if action.startswith("item_") or action.startswith("combo_"):
        target = _normalize_index_action_target(target, action=action)
    target_sig = _canonical_target(target)
    value = event.get("value") or {}
    action_call = _action_call(action)

    if action_call:
        return f"call:{action_call}|{_target_without_offset(target)}"

    if action in {"item_expanded", "item_collapsed"}:
        row, column = _extract_row_column(value)
        payload = {"row": row, "column": column}
        return f"{action}|{_target_without_offset(target)}|{json.dumps(payload, ensure_ascii=False, sort_keys=True)}"

    if action in {"tab_activated", "tab_current_changed", "tab_clicked"}:
        payload = {"index": int(value.get("index", -1))}
        return f"tab_activated|{_target_without_offset(target)}|{json.dumps(payload, ensure_ascii=False, sort_keys=True)}"

    if action == "text_changed":
        payload = {"text": str(value.get("text", ""))}
        return f"text_changed|{_target_without_offset(target)}|{json.dumps(payload, ensure_ascii=False, sort_keys=True)}"

    if action == "scroll":
        payload = {
            "axis": value.get("axis"),
            "delta": int(value.get("delta", 0)),
        }
        return f"{action}|{_target_without_offset(target)}|{json.dumps(payload, ensure_ascii=False, sort_keys=True)}"

    if action == "key_press":
        payload = {
            "key": value.get("key"),
            "text": value.get("text"),
            "modifiers": event.get("modifiers") or [],
        }
        return f"{action}|{target_sig}|{json.dumps(payload, ensure_ascii=False, sort_keys=True)}"

    return f"{action}|{target_sig}|{json.dumps(value, ensure_ascii=False, sort_keys=True)}"


def _dedupe_events(events: List[Dict[str, Any]], max_gap_sec: float = 0.25) -> List[Dict[str, Any]]:
    deduped: List[Dict[str, Any]] = []
    last_sig = None
    last_ts = None
    for event in events:
        sig = _event_signature(event)
        ts = event.get("timestamp")
        if isinstance(ts, (int, float)) and last_sig == sig and isinstance(last_ts, (int, float)):
            if float(ts) - float(last_ts) <= max_gap_sec:
                if deduped and _event_priority(event) > _event_priority(deduped[-1]):
                    deduped[-1] = event
                    last_ts = ts
                continue
        deduped.append(event)
        last_sig = sig
        last_ts = ts
    deduped = _drop_tabbar_click_shadows(deduped)
    deduped = _drop_combobox_popup_click_shadows(deduped)
    deduped = _drop_transient_semantic_noise(deduped)
    deduped = _squash_text_changed_events(deduped)
    deduped = _drop_keypress_shadows_of_text_changed(deduped)
    return deduped


def _drop_transient_semantic_noise(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    dropped_actions = {"combo_highlighted"}
    return [event for event in events if str(event.get("action", "")) not in dropped_actions]


def _squash_text_changed_events(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []
    for event in events:
        action = str(event.get("action", ""))
        if action != "text_changed":
            result.append(event)
            continue

        key = _target_without_offset(event.get("target") or {})
        if result and str(result[-1].get("action", "")) == "text_changed":
            prev_key = _target_without_offset(result[-1].get("target") or {})
            if key == prev_key:
                result[-1] = event
                continue
        result.append(event)
    return result


def _drop_keypress_shadows_of_text_changed(
    events: List[Dict[str, Any]],
    max_gap_sec: float = 0.4,
) -> List[Dict[str, Any]]:
    text_changed_marks: List[Tuple[str, float]] = []
    for event in events:
        if str(event.get("action", "")) != "text_changed":
            continue
        ts = event.get("timestamp")
        if not isinstance(ts, (int, float)):
            continue
        key = _target_without_offset(event.get("target") or {})
        text_changed_marks.append((key, float(ts)))

    result: List[Dict[str, Any]] = []
    for event in events:
        action = str(event.get("action", ""))
        if action != "key_press":
            result.append(event)
            continue
        ts = event.get("timestamp")
        if not isinstance(ts, (int, float)):
            result.append(event)
            continue

        value = event.get("value") or {}
        modifiers = event.get("modifiers") or []
        text_value = str(value.get("text", "") or "")
        if modifiers:
            result.append(event)
            continue
        if not text_value:
            result.append(event)
            continue

        key = _target_without_offset(event.get("target") or {})
        shadowed = any(k == key and abs(float(ts) - t) <= max_gap_sec for k, t in text_changed_marks)
        if shadowed:
            continue
        result.append(event)
    return result


def _drop_tabbar_click_shadows(events: List[Dict[str, Any]], max_gap_sec: float = 0.35) -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []
    tab_events: List[Tuple[str, float]] = []

    for event in events:
        action = str(event.get("action", ""))
        ts = event.get("timestamp")
        target = event.get("target") or {}
        target_key = _target_without_offset(target)
        widget_def = target.get("widget_def") or {}
        widget_type = str(widget_def.get("type", ""))

        if action in {"tab_activated", "tab_current_changed", "tab_clicked"} and isinstance(ts, (int, float)):
            tab_events.append((target_key, float(ts)))
            result.append(event)
            continue

        if action in {"click", "double_click", "right_click"} and "TabBar" in widget_type and isinstance(ts, (int, float)):
            shadowed = False
            for tab_key, tab_ts in reversed(tab_events[-8:]):
                if tab_key == target_key and abs(float(ts) - tab_ts) <= max_gap_sec:
                    shadowed = True
                    break
            if shadowed:
                continue

        result.append(event)
    return result


def _drop_combobox_popup_click_shadows(
    events: List[Dict[str, Any]],
    max_gap_sec: float = 0.5,
) -> List[Dict[str, Any]]:
    semantic_times: List[float] = []
    semantic_actions = {
        "item_clicked",
        "item_selection_changed",
        "item_double_clicked",
        "item_activated",
        "combo_activated",
    }

    for event in events:
        action = str(event.get("action", ""))
        ts = event.get("timestamp")
        value = event.get("value") or {}
        if action in semantic_actions and isinstance(ts, (int, float)):
            if "index_path" in value or "row" in value or "column" in value:
                semantic_times.append(float(ts))

    result: List[Dict[str, Any]] = []
    for event in events:
        action = str(event.get("action", ""))
        ts = event.get("timestamp")
        target = event.get("target") or {}
        widget_def = target.get("widget_def") or {}
        widget_type = str(widget_def.get("type", ""))

        if (
            action in {"click", "double_click", "right_click"}
            and "ComboBoxPrivateContainer" in widget_type
            and isinstance(ts, (int, float))
        ):
            if any(abs(float(ts) - semantic_ts) <= max_gap_sec for semantic_ts in semantic_times):
                continue

        result.append(event)
    return result


def _emit_activate_index(lines: List[str], target: Dict[str, Any], value: Dict[str, Any], action: str = ""):
    target_data = _format_target(_normalize_index_action_target(target, action=action))
    if not target_data:
        return
    widget_def, occurrence, _ = target_data
    row, column = _extract_row_column(value)
    if row is None:
        return
    if column is None or int(column) == 0:
        lines.append(
            f"{_find_expr(widget_def, occurrence=occurrence)}.activateIndex(row={row})"
        )
    else:
        lines.append(
            f"{_find_expr(widget_def, occurrence=occurrence)}.activateIndex(row={row}, column={int(column)})"
        )


def _emit_expand_collapse(
    lines: List[str],
    target: Dict[str, Any],
    value: Dict[str, Any],
    expanded: bool,
    action: str = "",
):
    target_data = _format_target(_normalize_index_action_target(target, action=action))
    if not target_data:
        return
    widget_def, occurrence, _ = target_data
    row, column = _extract_row_column(value or {})
    if row is None:
        return
    action_name = "expand" if expanded else "collapse"
    if column is None:
        lines.append(
            f"{_find_expr(widget_def, occurrence=occurrence)}.{action_name}(row={row})"
        )
        return
    lines.append(
        f"{_find_expr(widget_def, occurrence=occurrence)}.{action_name}(row={row}, column={column})"
    )


def _has_recent_click_for_target(
    events: List[Dict[str, Any]],
    index: int,
    target: Dict[str, Any],
    max_gap_sec: float = 1.2,
) -> bool:
    target_key = _target_without_offset(target)
    if not target_key:
        return False
    current_ts = events[index].get("timestamp")
    for i in range(index - 1, max(-1, index - 6), -1):
        prev = events[i]
        if str(prev.get("action", "")) != "click":
            continue
        prev_target = prev.get("target") or {}
        prev_key = _target_without_offset(prev_target)
        if prev_key != target_key:
            continue
        prev_ts = prev.get("timestamp")
        if isinstance(current_ts, (int, float)) and isinstance(prev_ts, (int, float)):
            if float(current_ts) - float(prev_ts) > max_gap_sec:
                continue
        return True
    return False


def generate_python_script(events: List[Dict[str, Any]], server_name: str = "") -> str:
    events = _dedupe_events(events or [])
    lines: List[str] = []
    body: List[str] = []
    for idx, event in enumerate(events):
        action = str(event.get("action", ""))
        target = event.get("target") or {}
        value = event.get("value") or {}
        source = event.get("source", "")
        call_name = _action_call(action)

        if action in {
            "item_clicked",
            "item_selection_changed",
            "item_double_clicked",
            "item_activated",
            "combo_activated",
        } and (
            "index_path" in value or "row" in value or "column" in value
        ):
            if action == "combo_activated":
                combo_target = _normalize_index_action_target(target, action=action)
                if not _has_recent_click_for_target(events, idx, combo_target):
                    combo_target_data = _format_target(combo_target)
                    if combo_target_data:
                        widget_def, occurrence, _ = combo_target_data
                        body.append(f"{_find_expr(widget_def, occurrence=occurrence)}.click()")
            _emit_activate_index(body, target, value, action=action)
            continue

        if action in {"tab_activated", "tab_current_changed", "tab_clicked"}:
            target_data = _format_target(target)
            if target_data:
                widget_def, occurrence, _ = target_data
                tab_index = int((value or {}).get("index", -1))
                body.append(
                    f"{_find_expr(widget_def, occurrence=occurrence)}.activateTab(index={tab_index})"
                )
            continue

        if action == "text_changed":
            target_data = _format_target(target)
            if target_data:
                widget_def, occurrence, _ = target_data
                text_value = str((value or {}).get("text", ""))
                body.append(
                    f"{_find_expr(widget_def, occurrence=occurrence)}.setText({json.dumps(text_value, ensure_ascii=False)})"
                )
            continue

        if call_name:
            _emit_click(body, action, target)
            continue

        if action in {"item_expanded"}:
            _emit_expand_collapse(body, target, value, expanded=True, action=action)
            continue

        if action in {"item_collapsed"}:
            _emit_expand_collapse(body, target, value, expanded=False, action=action)
            continue

        if action == "drag":
            drag_from = (value or {}).get("from") or {}
            drag_to = (value or {}).get("to") or {}
            source_data = _format_target(drag_from)
            target_data = _format_target(drag_to)
            if source_data and target_data:
                src_def, src_occ, _ = source_data
                dst_def, dst_occ, _ = target_data
                body.append(f"sx, sy = {_find_expr(src_def, occurrence=src_occ)}.center()")
                body.append(f"ex, ey = {_find_expr(dst_def, occurrence=dst_occ)}.center()")
                body.append("dancemonkey.mousekey.move_to(sx, sy)")
                body.append("dancemonkey.mousekey.drag_to(ex, ey)")
            continue

        if action == "scroll":
            delta = int((value or {}).get("delta", 0))
            target_data = _format_target(target)
            if target_data:
                widget_def, occurrence, _ = target_data
                axis = (value or {}).get("axis", "vertical")
                body.append(
                    f"{_find_expr(widget_def, occurrence=occurrence)}.scrollEvent(delta={delta}, axis={json.dumps(axis, ensure_ascii=False)})"
                )
            else:
                body.append(f"dancemonkey.mousekey.mouse_scroll({delta})")
            continue

        if action == "key_press":
            text = (value or {}).get("text") or ""
            modifiers = event.get("modifiers") or []
            if text and not modifiers:
                body.append(f"dancemonkey.mousekey.press_key({json.dumps(text, ensure_ascii=False)})")
            continue

        continue

    if not body:
        return "\n".join(lines)

    if lines:
        lines.append("")
    lines.extend(body)
    return "\n".join(lines) + "\n"
