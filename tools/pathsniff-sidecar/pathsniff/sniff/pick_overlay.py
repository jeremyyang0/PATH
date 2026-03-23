from PySide2.QtCore import QObject, QRect, Qt, Signal, Slot
from PySide2.QtGui import QColor, QCursor, QPainter, QPen, QPixmap
from PySide2.QtWidgets import QApplication, QDialog

from pathsniff.sniff.baseclient import RouterHttpClient


def capture_virtual_desktop():
    screens = QApplication.screens()
    if not screens:
        return QPixmap(), QRect()

    virtual_geometry = QRect(screens[0].geometry())
    for screen in screens[1:]:
        virtual_geometry = virtual_geometry.united(screen.geometry())

    primary_screen = QApplication.primaryScreen()
    desktop = QApplication.desktop()
    if primary_screen and desktop:
        screenshot = primary_screen.grabWindow(
            desktop.winId(),
            virtual_geometry.x(),
            virtual_geometry.y(),
            virtual_geometry.width(),
            virtual_geometry.height(),
        )
        if not screenshot.isNull():
            screenshot.setDevicePixelRatio(1.0)
            if screenshot.size() != virtual_geometry.size():
                screenshot = screenshot.scaled(
                    virtual_geometry.size(),
                    Qt.IgnoreAspectRatio,
                    Qt.FastTransformation,
                )
            return screenshot, virtual_geometry

    screenshot = QPixmap(virtual_geometry.size())
    screenshot.fill(Qt.black)

    painter = QPainter(screenshot)
    for screen in screens:
        screen_geometry = screen.geometry()
        screen_pixmap = screen.grabWindow(0)
        offset = screen_geometry.topLeft() - virtual_geometry.topLeft()
        painter.drawPixmap(offset, screen_pixmap)
    painter.end()
    screenshot.setDevicePixelRatio(1.0)

    return screenshot, virtual_geometry


class ScreenPickOverlay(QDialog):
    hover_point_changed = Signal(int, int)
    point_confirmed = Signal(int, int, bool)
    cancelled = Signal()

    def __init__(self, screenshot, virtual_geometry, parent=None):
        super().__init__(parent)
        self._background = screenshot
        self._virtual_geometry = QRect(virtual_geometry)
        self._hover_highlight_rect = None
        self._selected_highlight_rects = []

        self.setWindowFlags(
            Qt.FramelessWindowHint | Qt.Tool | Qt.WindowStaysOnTopHint
        )
        self.setModal(False)
        self.setMouseTracking(True)
        self.setFocusPolicy(Qt.StrongFocus)
        self.setCursor(Qt.CrossCursor)
        self.setAttribute(Qt.WA_OpaquePaintEvent, True)
        self.setGeometry(self._virtual_geometry)

    def set_highlight(self, response):
        highlight_rect = None
        if response and response.get("found"):
            position = response.get("position") or (-1, -1)
            size = response.get("size") or (0, 0)
            highlight_rect = QRect(
                int(position[0]) - self._virtual_geometry.x(),
                int(position[1]) - self._virtual_geometry.y(),
                int(size[0]),
                int(size[1]),
            )

        if highlight_rect == self._hover_highlight_rect:
            return

        self._hover_highlight_rect = highlight_rect
        self.update()

    def clear_highlight(self):
        self.set_highlight(None)

    def set_selected_highlights(self, responses):
        selected_rects = []
        for response in responses or []:
            if not response or not response.get("found"):
                continue
            position = response.get("position") or (-1, -1)
            size = response.get("size") or (0, 0)
            selected_rects.append(
                QRect(
                    int(position[0]) - self._virtual_geometry.x(),
                    int(position[1]) - self._virtual_geometry.y(),
                    int(size[0]),
                    int(size[1]),
                )
            )

        if selected_rects == self._selected_highlight_rects:
            return

        self._selected_highlight_rects = selected_rects
        self.update()

    def showEvent(self, event):
        super().showEvent(event)
        self.raise_()
        self.activateWindow()
        self.setFocus()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.drawPixmap(0, 0, self._background)

        fill_color = QColor(255, 0, 0, 48)
        border_pen = QPen(QColor(255, 64, 64), 3)
        for rect in self._selected_highlight_rects:
            painter.fillRect(rect, fill_color)
            painter.setPen(border_pen)
            painter.drawRect(rect.adjusted(1, 1, -2, -2))

        if self._hover_highlight_rect:
            hover_fill_color = QColor(255, 0, 0, 36)
            hover_border_pen = QPen(QColor(255, 96, 96), 2)
            painter.fillRect(self._hover_highlight_rect, hover_fill_color)
            painter.setPen(hover_border_pen)
            painter.drawRect(self._hover_highlight_rect.adjusted(1, 1, -2, -2))

    def mouseMoveEvent(self, event):
        global_pos = QCursor.pos()
        self.hover_point_changed.emit(global_pos.x(), global_pos.y())
        super().mouseMoveEvent(event)

    def mousePressEvent(self, event):
        global_pos = QCursor.pos()
        if event.button() == Qt.LeftButton:
            ctrl_pressed = bool(event.modifiers() & Qt.ControlModifier)
            self.point_confirmed.emit(global_pos.x(), global_pos.y(), ctrl_pressed)
            event.accept()
            return
        if event.button() == Qt.RightButton:
            self.cancelled.emit()
            event.accept()
            return
        super().mousePressEvent(event)

    def keyPressEvent(self, event):
        if event.key() == Qt.Key_Escape:
            self.cancelled.emit()
            event.accept()
            return
        super().keyPressEvent(event)


class PointLookupWorker(QObject):
    lookup_finished = Signal(object)
    lookup_failed = Signal(object)

    def __init__(self, server_name):
        super().__init__()
        self.server_name = server_name

    @Slot(object)
    def lookup(self, request):
        client = RouterHttpClient(self.server_name)
        try:
            response = client.post(
                "find_widget_by_point",
                {
                    "x": request["x"],
                    "y": request["y"],
                    "refresh": request.get("refresh", False),
                    "use_cursor": True,
                },
            )
            payload = dict(request)
            payload["response"] = response
            self.lookup_finished.emit(payload)
        except Exception as exc:
            payload = dict(request)
            payload["error"] = str(exc)
            self.lookup_failed.emit(payload)
