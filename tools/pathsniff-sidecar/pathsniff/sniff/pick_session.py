import sys
from typing import Any, Dict, Optional

from PySide2.QtCore import QObject, QThread, QTimer, Qt, Signal
from PySide2.QtWidgets import QApplication

from pathsniff.sniff.pick_overlay import (
    PointLookupWorker,
    ScreenPickOverlay,
    capture_virtual_desktop,
)
from pathsniff.sniff.sidecar_client import SidecarClientError, SniffSidecarClient


class SniffCommandError(RuntimeError):
    def __init__(self, error_type: str, message: str):
        super().__init__(message)
        self.error_type = error_type
        self.message = message


class PickSession(QObject):
    point_lookup_requested = Signal(object)
    finished = Signal(object)

    def __init__(self, server_name: str):
        super().__init__()
        self.server_name = server_name
        self.client = SniffSidecarClient(server_name)
        self.pick_overlay = None
        self._hover_lookup_point = None
        self._confirm_lookup_point = None
        self._lookup_in_flight = False
        self._lookup_token = 0
        self._active_lookup = None
        self._selected_widget_ids = []
        self._selected_responses_by_widget_id = {}
        self._last_selected_point = None
        self._multi_pick_active = False
        self._setup_pick_worker()

    def _setup_pick_worker(self) -> None:
        self._pick_lookup_thread = QThread(self)
        self._pick_lookup_worker = PointLookupWorker(self.server_name)
        self._pick_lookup_worker.moveToThread(self._pick_lookup_thread)
        self.point_lookup_requested.connect(self._pick_lookup_worker.lookup)
        self._pick_lookup_worker.lookup_finished.connect(self._on_point_lookup_finished)
        self._pick_lookup_worker.lookup_failed.connect(self._on_point_lookup_failed)
        self._pick_lookup_thread.start()

        self._hover_lookup_timer = QTimer(self)
        self._hover_lookup_timer.setInterval(50)
        self._hover_lookup_timer.timeout.connect(self._process_overlay_tick)

    def start(self) -> None:
        try:
            self.client.activate_application_window()
            QApplication.processEvents()
            self.client.refresh_widget_tree()
            tree = self.client.get_widget_tree()
            if self._tree_is_empty(tree):
                raise SniffCommandError("NoWidgetsAvailable", "Current widget tree is empty.")
        except SidecarClientError as exc:
            self._finish_error(exc.error_type, exc.message)
            return
        except Exception as exc:
            self._finish_error("ApplicationActivationFailed", str(exc))
            return

        QTimer.singleShot(250, self._show_pick_overlay)

    def dispose(self) -> None:
        self._hover_lookup_timer.stop()
        if self.pick_overlay:
            try:
                self.pick_overlay.hover_point_changed.disconnect(self._on_overlay_hover)
                self.pick_overlay.point_confirmed.disconnect(self._on_overlay_confirmed)
                self.pick_overlay.cancelled.disconnect(self._on_overlay_cancelled)
            except Exception:
                pass
            self.pick_overlay.close()
            self.pick_overlay.deleteLater()
            self.pick_overlay = None

        if self._pick_lookup_thread.isRunning():
            self._pick_lookup_thread.quit()
            self._pick_lookup_thread.wait(1000)

    @staticmethod
    def _tree_is_empty(tree_payload: Dict[str, Any]) -> bool:
        children = tree_payload.get("children") or []
        return len(children) == 0

    def _show_pick_overlay(self) -> None:
        screenshot, virtual_geometry = capture_virtual_desktop()
        if screenshot.isNull() or virtual_geometry.isNull():
            error_type = "ScreenCapturePermissionDenied" if sys.platform == "darwin" else "ScreenCaptureFailed"
            self._finish_error(error_type, "Unable to capture the current desktop.")
            return

        self.pick_overlay = ScreenPickOverlay(screenshot, virtual_geometry)
        self.pick_overlay.hover_point_changed.connect(self._on_overlay_hover)
        self.pick_overlay.point_confirmed.connect(self._on_overlay_confirmed)
        self.pick_overlay.cancelled.connect(self._on_overlay_cancelled)
        self.pick_overlay.show()
        self._hover_lookup_timer.start()

    def _on_overlay_hover(self, x: int, y: int) -> None:
        if self._confirm_lookup_point is not None:
            return
        self._hover_lookup_point = (x, y)

    def _on_overlay_confirmed(self, x: int, y: int, append_selection: bool) -> None:
        if not self.pick_overlay:
            return

        self._confirm_lookup_point = (x, y)
        self._hover_lookup_point = None
        if append_selection:
            self._multi_pick_active = True
        self.pick_overlay.setCursor(Qt.BusyCursor)

        if not self._lookup_in_flight:
            self._dispatch_confirm_lookup()

    def _on_overlay_cancelled(self) -> None:
        self._finish({"status": "cancelled"})

    def _process_overlay_tick(self) -> None:
        self._dispatch_hover_lookup()
        self._finish_multi_pick_if_needed()

    def _dispatch_hover_lookup(self) -> None:
        if not self.pick_overlay or self._lookup_in_flight or self._confirm_lookup_point:
            return
        if not self._hover_lookup_point:
            return

        x, y = self._hover_lookup_point
        self._hover_lookup_point = None
        self._emit_point_lookup(x, y, refresh=False, mode="hover")

    def _dispatch_confirm_lookup(self) -> None:
        if not self.pick_overlay or self._lookup_in_flight:
            return
        if not self._confirm_lookup_point:
            return

        x, y = self._confirm_lookup_point
        self._emit_point_lookup(x, y, refresh=True, mode="confirm")

    def _emit_point_lookup(self, x: int, y: int, refresh: bool, mode: str) -> None:
        self._lookup_token += 1
        request = {
            "token": self._lookup_token,
            "x": x,
            "y": y,
            "refresh": refresh,
            "mode": mode,
            "append_selection": bool(self._multi_pick_active),
        }
        self._active_lookup = request
        self._lookup_in_flight = True
        self.point_lookup_requested.emit(request)

    def _finish_multi_pick_if_needed(self) -> None:
        if not self._multi_pick_active:
            return
        if self._lookup_in_flight or self._confirm_lookup_point is not None:
            return
        if QApplication.keyboardModifiers() & Qt.ControlModifier:
            return

        if self._selected_widget_ids:
            self._finish_selected_payload()
            return

        self._finish({"status": "cancelled"})

    def _on_point_lookup_finished(self, payload: Dict[str, Any]) -> None:
        active_lookup = self._active_lookup
        if not active_lookup or payload.get("token") != active_lookup.get("token"):
            return

        self._lookup_in_flight = False
        self._active_lookup = None
        response = payload.get("response", {})
        mode = payload.get("mode")

        if mode == "hover":
            if self.pick_overlay:
                if response.get("found"):
                    self.pick_overlay.set_highlight(response)
                else:
                    self.pick_overlay.clear_highlight()

            if self._confirm_lookup_point is not None:
                self._dispatch_confirm_lookup()
            return

        if response.get("found"):
            widget_id = str(response.get("widget_id") or "")
            point = response.get("point") or self._confirm_lookup_point or (0, 0)
            if payload.get("append_selection"):
                self._toggle_selected_widget(widget_id, response, point)
                self._confirm_lookup_point = None
                if self.pick_overlay:
                    self.pick_overlay.setCursor(Qt.CrossCursor)
                    self.pick_overlay.set_selected_highlights(self._selected_highlights())
                self._finish_multi_pick_if_needed()
                return

            self._selected_widget_ids = [widget_id]
            self._selected_responses_by_widget_id = {widget_id: response}
            self._last_selected_point = (int(point[0]), int(point[1]))
            self._finish_selected_payload()
            return

        self._confirm_lookup_point = None
        if self.pick_overlay:
            self.pick_overlay.clear_highlight()
            self.pick_overlay.setCursor(Qt.CrossCursor)

    def _on_point_lookup_failed(self, payload: Dict[str, Any]) -> None:
        active_lookup = self._active_lookup
        if active_lookup and payload.get("token") != active_lookup.get("token"):
            return

        self._lookup_in_flight = False
        self._active_lookup = None
        mode = payload.get("mode")
        if mode == "hover":
            if self._confirm_lookup_point is not None:
                self._dispatch_confirm_lookup()
            return

        self._confirm_lookup_point = None
        self._finish_error("PickLookupFailed", str(payload.get("error") or "Unknown error"))

    def _finish_error(self, error_type: str, message: str) -> None:
        self._finish(
            {
                "status": "error",
                "errorType": error_type,
                "message": message,
            }
        )

    def _toggle_selected_widget(self, widget_id: str, response: Dict[str, Any], point: Any) -> None:
        if not widget_id:
            return
        if widget_id in self._selected_widget_ids:
            self._selected_widget_ids = [
                selected_widget_id
                for selected_widget_id in self._selected_widget_ids
                if selected_widget_id != widget_id
            ]
            self._selected_responses_by_widget_id.pop(widget_id, None)
        else:
            self._selected_widget_ids.append(widget_id)
            self._selected_responses_by_widget_id[widget_id] = response
        self._last_selected_point = (int(point[0]), int(point[1]))

    def _selected_highlights(self):
        return [
            self._selected_responses_by_widget_id[widget_id]
            for widget_id in self._selected_widget_ids
            if widget_id in self._selected_responses_by_widget_id
        ]

    def _finish_selected_payload(self) -> None:
        primary_widget_id = self._selected_widget_ids[-1] if self._selected_widget_ids else ""
        point = self._last_selected_point or (0, 0)
        self._finish(
            {
                "status": "selected",
                "widgetId": primary_widget_id,
                "widgetIds": list(self._selected_widget_ids),
                "primaryWidgetId": primary_widget_id,
                "point": [int(point[0]), int(point[1])],
            }
        )

    def _finish(self, payload: Dict[str, Any]) -> None:
        self.dispose()
        self.finished.emit(payload)
