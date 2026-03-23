import json
import os
import re
import time
from PySide2.QtCore import QPoint, Qt, QThread, QTimer, Signal
from PySide2.QtGui import QStandardItemModel, QStandardItem, QFont
from PySide2.QtNetwork import QLocalServer
from PySide2.QtWidgets import (QMainWindow,
                               QTreeView,
                               QVBoxLayout,
                               QWidget,
                               QPushButton,
                               QHBoxLayout,
                               QMessageBox,
                               QMenu,
                               QAction,
                               QHeaderView,
                               QTableWidget,
                               QTableWidgetItem,
                               QSplitter,
                               QAbstractItemView,
                               QApplication,
                               QLabel,
                               QLineEdit,
                               QListWidget,
                               QDialog,
                               QDialogButtonBox,
                               QListWidgetItem,
                               QTextEdit,
                               QTabWidget)
from pathsniff.logger import logger

from pathsniff._setting import setting
from pathsniff.shared.models import WidgetTreeNode
from pathsniff.sniff.pick_overlay import (
    PointLookupWorker,
    ScreenPickOverlay,
    capture_virtual_desktop,
)
from pathsniff.sniff.record_codegen import generate_python_script
from pathsniff.sniff.sniff_client import WidgetTreeClient


class FindWidgetDialog(QDialog):
    """查找控件结果对话框"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("查找控件结果")

        # 高DPI优化：根据屏幕DPI调整对话框大小
        screen = QApplication.primaryScreen()
        dpi = screen.logicalDotsPerInch()
        scale_factor = dpi / 96.0  # 96是标准DPI

        # 基础对话框大小乘以缩放因子
        base_width = 400
        base_height = 300
        self.resize(int(base_width * scale_factor), int(base_height * scale_factor))

        # 设置最小对话框大小
        self.setMinimumSize(int(350 * scale_factor), int(250 * scale_factor))
        self.setModal(False)  # 设置为非模态对话框
        self.main_window = parent  # 保存主窗口引用

        layout = QVBoxLayout(self)

        # 结果列表
        self.result_list = QListWidget()
        layout.addWidget(self.result_list)

        # 按钮
        button_box = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        button_box.accepted.connect(self.accept)
        button_box.rejected.connect(self.reject)
        layout.addWidget(button_box)

        # 连接双击事件
        self.result_list.itemDoubleClicked.connect(self._on_item_double_clicked)

    def set_results(self, results):
        """设置查找结果
        
        Args:
            results: 查找到的控件节点列表
        """
        self.result_list.clear()
        for widget_node in results:
            item = QListWidgetItem(
                f"{widget_node.type} - {widget_node.text} (ID: {widget_node.widget_id})")
            item.setData(Qt.UserRole, widget_node.widget_id)  # 存储widget_id
            self.result_list.addItem(item)

    def get_selected_widget_id(self):
        """获取选中的widget_id
        
        Returns:
            str: 选中的widget_id，如果没有选中则返回None
        """
        current_item = self.result_list.currentItem()
        if current_item:
            return current_item.data(Qt.UserRole)
        return None

    def _on_item_double_clicked(self, item):
        """双击项目事件 - 展开树节点并高亮对应控件
        
        Args:
            item: 被双击的列表项
        """
        widget_id = item.data(Qt.UserRole)
        if widget_id and self.main_window:
            # 在树中查找对应的项并展开，同时高亮控件
            self.main_window._select_and_highlight_widget(widget_id)




class RecordResultDialog(QDialog):
    def __init__(self, code_text: str, json_text: str, event_count: int, parent=None):
        super().__init__(parent)
        self.setWindowTitle("录制结果")
        self.resize(900, 600)

        layout = QVBoxLayout(self)
        self.summary_label = QLabel(
            f"事件数: {int(event_count)}（默认已复制 Code 到剪贴板）"
        )
        self.summary_label.setWordWrap(True)
        layout.addWidget(self.summary_label)

        self.tab_widget = QTabWidget(self)
        layout.addWidget(self.tab_widget)

        self.code_text_edit = QTextEdit(self)
        self.code_text_edit.setReadOnly(True)
        self.code_text_edit.setPlainText(code_text or "")
        self.tab_widget.addTab(self.code_text_edit, "Code")

        self.json_text_edit = QTextEdit(self)
        self.json_text_edit.setReadOnly(True)
        self.json_text_edit.setPlainText(json_text or "")
        self.tab_widget.addTab(self.json_text_edit, "JSON")

        button_layout = QHBoxLayout()
        self.copy_current_button = QPushButton("复制当前页")
        self.copy_current_button.clicked.connect(self._copy_current_tab_content)
        button_layout.addWidget(self.copy_current_button)

        self.close_button = QPushButton("关闭")
        self.close_button.clicked.connect(self.accept)
        button_layout.addWidget(self.close_button)
        layout.addLayout(button_layout)

    def _copy_current_tab_content(self):
        current_widget = self.tab_widget.currentWidget()
        if current_widget is self.code_text_edit:
            text = self.code_text_edit.toPlainText()
        elif current_widget is self.json_text_edit:
            text = self.json_text_edit.toPlainText()
        else:
            text = ""
        QApplication.clipboard().setText(text)


class RecordingFloatingToolbar(QWidget):
    start_requested = Signal()
    stop_requested = Signal()
    closed = Signal()

    def __init__(self):
        super().__init__(
            None,
            Qt.Tool
            | Qt.WindowStaysOnTopHint
            | Qt.CustomizeWindowHint
            | Qt.WindowTitleHint
            | Qt.WindowCloseButtonHint,
        )
        self.setWindowTitle("录制工具栏")
        self.setWindowFlag(Qt.WindowContextHelpButtonHint, False)
        self.setFixedSize(360, 70)

        layout = QHBoxLayout(self)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(8)

        self.status_label = QLabel("状态: 未开始")
        self.start_button = QPushButton("开始录制")
        self.stop_button = QPushButton("停止录制")

        self.start_button.clicked.connect(self.start_requested.emit)
        self.stop_button.clicked.connect(self.stop_requested.emit)

        layout.addWidget(self.status_label, 1)
        layout.addWidget(self.start_button)
        layout.addWidget(self.stop_button)

    def set_recording(self, recording: bool):
        if recording:
            self.status_label.setText("状态: 录制中")
            self.start_button.setEnabled(False)
        else:
            self.status_label.setText("状态: 未开始")
            self.start_button.setEnabled(True)

    def set_status_text(self, text: str):
        self.status_label.setText(text)

    def showEvent(self, event):
        super().showEvent(event)
        screen = QApplication.primaryScreen()
        if not screen:
            return
        area = screen.availableGeometry()
        x = area.x() + (area.width() - self.width()) // 2
        y = area.y() + 40
        self.move(x, y)

    def closeEvent(self, event):
        self.closed.emit()
        super().closeEvent(event)


class MainWindow(QMainWindow):
    point_lookup_requested = Signal(object)
    """主窗口类"""

    def __init__(self, server_name: str = "common"):
        super().__init__()
        self.server_name = server_name
        self.client = WidgetTreeClient(server_name)
        self.client.widget_tree_received.connect(self._on_widget_tree_received)
        self.client.widget_info_received.connect(self._on_widget_info_received)
        self.client.error_received.connect(self._on_error_received)
        self.client.find_widgets_received.connect(self._on_find_widgets_received)
        self.client.widget_def_received.connect(self._on_widget_def_received)

        self.pick_overlay = None
        self._picker_window_state = None
        self._hover_lookup_point = None
        self._confirm_lookup_point = None
        self._lookup_in_flight = False
        self._lookup_token = 0
        self._active_lookup = None
        self._pick_launch_pending = False
        self._record_toolbar = None
        self._record_window_state = None
        self._is_recording = False
        self._tree_notify_server = None
        self._tree_notify_channel = ""
        self._last_tree_notify_version = -1
        self._initial_tree_loaded = False

        self._setup_ui()
        self._connect_signals()
        self._setup_pick_worker()
        self._setup_tree_change_notifier()

        # 存储树节点到控件ID的映射
        self.item_to_widget_id = {}  # id(item) -> widget_id

        # 跟踪展开的节点widget_id
        self.expanded_widget_ids = set()

        # 跟踪当前选中的widget_id
        self.selected_widget_id = None

        # 存储当前树结构，用于增量更新对比
        self.current_tree_nodes = {}  # widget_id -> WidgetTreeNode
        self.widget_id_to_item = {}  # widget_id -> QStandardItem

    def _setup_pick_worker(self):
        self._pick_lookup_thread = QThread(self)
        self._pick_lookup_worker = PointLookupWorker(self.server_name)
        self._pick_lookup_worker.moveToThread(self._pick_lookup_thread)
        self.point_lookup_requested.connect(self._pick_lookup_worker.lookup)
        self._pick_lookup_worker.lookup_finished.connect(self._on_point_lookup_finished)
        self._pick_lookup_worker.lookup_failed.connect(self._on_point_lookup_failed)
        self._pick_lookup_thread.start()

        self._hover_lookup_timer = QTimer(self)
        self._hover_lookup_timer.setInterval(50)
        self._hover_lookup_timer.timeout.connect(self._dispatch_hover_lookup)

    def _setup_tree_change_notifier(self):
        channel = f"sniff_tree_notify_{os.getpid()}_{int(time.time() * 1000)}"
        self._tree_notify_channel = channel
        self._tree_notify_server = QLocalServer(self)
        try:
            QLocalServer.removeServer(channel)
        except Exception:
            pass
        if not self._tree_notify_server.listen(channel):
            logger.warning("启动树变更通知监听失败，自动刷新将不可用")
            return
        self._tree_notify_server.newConnection.connect(self._on_tree_notify_new_connection)
        res = self.client.request_register_tree_change_notifier(channel)
        if isinstance(res, dict) and res.get("unsupported"):
            logger.info("当前 server 不支持树变更推送，已降级为手动刷新")
            try:
                self._tree_notify_server.newConnection.disconnect(self._on_tree_notify_new_connection)
            except Exception:
                pass
            self._tree_notify_server.close()
            self._tree_notify_server.deleteLater()
            self._tree_notify_server = None
            self._tree_notify_channel = ""
            return
        if not isinstance(res, dict) or res.get("error"):
            logger.warning("注册树变更通知失败，自动刷新将不可用")

    def _teardown_tree_change_notifier(self):
        channel = self._tree_notify_channel
        if channel:
            self.client.request_unregister_tree_change_notifier(channel)
        self._tree_notify_channel = ""
        if self._tree_notify_server:
            try:
                self._tree_notify_server.newConnection.disconnect(self._on_tree_notify_new_connection)
            except Exception:
                pass
            try:
                self._tree_notify_server.close()
            except Exception:
                pass
            self._tree_notify_server.deleteLater()
        self._tree_notify_server = None

    def _on_tree_notify_new_connection(self):
        if not self._tree_notify_server:
            return
        while self._tree_notify_server.hasPendingConnections():
            socket = self._tree_notify_server.nextPendingConnection()
            if socket is None:
                return
            socket.readyRead.connect(lambda s=socket: self._on_tree_notify_ready_read(s))
            socket.disconnected.connect(socket.deleteLater)
            self._on_tree_notify_ready_read(socket)

    def _on_tree_notify_ready_read(self, socket):
        if socket is None:
            return
        try:
            data = bytes(socket.readAll()).decode("utf-8").strip()
        except Exception:
            data = ""
        if not data:
            return
        try:
            payload = json.loads(data)
        except Exception:
            return
        if str(payload.get("event", "")) != "widget_tree_changed":
            return
        try:
            version = int(payload.get("version", -1))
        except Exception:
            version = -1
        if version >= 0:
            if version == self._last_tree_notify_version:
                return
            self._last_tree_notify_version = version
        self._on_server_tree_changed(version)

    def _setup_fonts(self, scale_factor):
        """设置高DPI优化字体"""
        # 获取默认字体
        default_font = QFont()

        # 根据缩放因子调整字体大小
        base_font_size = 9  # 基础字体大小
        new_font_size = max(8, int(base_font_size * scale_factor))

        # 设置应用程序默认字体
        default_font.setPointSize(new_font_size)
        QApplication.setFont(default_font)

        # 为特定控件设置字体
        tree_font = QFont()
        tree_font.setPointSize(max(8, int(8 * scale_factor)))

        button_font = QFont()
        button_font.setPointSize(max(9, int(9 * scale_factor)))

    def _setup_ui(self):
        """设置UI界面"""
        self.setWindowTitle("控件树调试工具")

        # 高DPI优化：根据屏幕DPI调整窗口大小
        screen = QApplication.primaryScreen()
        dpi = screen.logicalDotsPerInch()
        scale_factor = dpi / 96.0  # 96是标准DPI

        # 基础窗口大小乘以缩放因子
        base_width = 1000
        base_height = 600
        self.resize(int(base_width * scale_factor), int(base_height * scale_factor))

        # 设置最小窗口大小
        self.setMinimumSize(int(800 * scale_factor), int(500 * scale_factor))

        # 高DPI优化：调整字体大小
        self._setup_fonts(scale_factor)

        # 创建中央部件
        central_widget = QWidget()
        self.setCentralWidget(central_widget)

        # 创建主布局（水平分割）
        main_layout = QHBoxLayout(central_widget)

        # 创建分割器
        splitter = QSplitter(Qt.Horizontal)
        main_layout.addWidget(splitter)

        # 左侧控件树区域
        left_widget = QWidget()
        left_layout = QVBoxLayout(left_widget)

        # 创建按钮布局
        button_layout = QHBoxLayout()

        # 刷新按钮
        self.refresh_button = QPushButton("刷新控件树(Ctrl+4)")
        button_layout.addWidget(self.refresh_button)
        self.pick_button = QPushButton("拾取控件")
        button_layout.addWidget(self.pick_button)
        self.record_button = QPushButton("录制操作")
        button_layout.addWidget(self.record_button)
        self.pick_status_label = QLabel("")
        button_layout.addWidget(self.pick_status_label)

        # 添加弹性空间
        button_layout.addStretch()

        left_layout.addLayout(button_layout)

        # 新增：查找控件区域
        find_widget_layout = QHBoxLayout()

        # widget_def输入框
        self.widget_def_input = QLineEdit()
        self.widget_def_input.setPlaceholderText("输入widget_def查找控件")
        find_widget_layout.addWidget(self.widget_def_input)

        # 查找控件按钮
        self.find_widget_button = QPushButton("查找控件")
        find_widget_layout.addWidget(self.find_widget_button)

        left_layout.addLayout(find_widget_layout)

        # 创建控件树
        self.tree_view = QTreeView()
        self.tree_model = QStandardItemModel()
        self.tree_model.setHorizontalHeaderLabels(["控件树"])
        self.tree_view.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.tree_view.setModel(self.tree_model)
        self.tree_view.header().setSectionResizeMode(QHeaderView.Interactive)
        self.tree_view.setContextMenuPolicy(Qt.CustomContextMenu)
        left_layout.addWidget(self.tree_view)

        splitter.addWidget(left_widget)

        # 右侧属性表格
        right_widget = QWidget()
        right_layout = QVBoxLayout(right_widget)

        # 属性标签
        # 这里可以添加标签，但我们直接放表格
        right_layout.setContentsMargins(0, 0, 0, 0)

        # 创建属性表格
        self.properties_table = QTableWidget()
        self.properties_table.setColumnCount(2)
        self.properties_table.setHorizontalHeaderLabels(["属性", "值"])
        self.properties_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.properties_table.verticalHeader().setVisible(False)
        self.properties_table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.properties_table.setSelectionMode(QAbstractItemView.SingleSelection)
        right_layout.addWidget(self.properties_table)

        # 添加widget_def区域
        widget_def_label = QLabel("Widget Definition:")
        right_layout.addWidget(widget_def_label)

        # 创建widget_def文本编辑框
        self.widget_def_textedit = QTextEdit()
        self.widget_def_textedit.setReadOnly(True)
        self.widget_def_textedit.setMaximumHeight(150)  # 限制高度
        self.widget_def_textedit.setPlaceholderText("选中控件后将显示widget_def...")
        right_layout.addWidget(self.widget_def_textedit)

        # 创建复制按钮
        self.copy_widget_def_button = QPushButton("复制")
        self.copy_widget_def_button.setEnabled(False)  # 初始状态禁用
        self.copy_widget_def_button.clicked.connect(self._copy_widget_def_to_clipboard)
        right_layout.addWidget(self.copy_widget_def_button)

        splitter.addWidget(right_widget)

        # 设置分割器比例
        splitter.setSizes([400, 600])

    def _connect_signals(self):
        """连接信号"""
        self.refresh_button.clicked.connect(self._refresh_widget_tree)
        self.pick_button.clicked.connect(self._start_widget_pick)
        self.record_button.clicked.connect(self._open_record_toolbar)
        self.find_widget_button.clicked.connect(self._find_widgets)  # 新增信号连接
        self.tree_view.customContextMenuRequested.connect(self._show_context_menu)
        self.tree_view.clicked.connect(self._on_item_clicked)
        self.tree_view.doubleClicked.connect(self._on_item_double_clicked)
        self.tree_view.expanded.connect(self._on_item_expanded)
        self.tree_view.collapsed.connect(self._on_item_collapsed)
        self.tree_view.selectionModel().selectionChanged.connect(self._on_selection_changed)
        # 连接textedit文本改变信号，用于更新复制按钮状态
        self.widget_def_textedit.textChanged.connect(self._on_widget_def_text_changed)

    def showEvent(self, event):
        """窗口显示事件"""
        super().showEvent(event)
        if not self._initial_tree_loaded:
            self._initial_tree_loaded = True
            self.refresh_button.setEnabled(False)
            self.client.request_refresh_widget_tree()

    def closeEvent(self, event):
        """窗口关闭事件"""
        self._close_pick_overlay(restore_window=False)
        self._close_record_toolbar(restore_window=False, stop_recording=True)
        if hasattr(self, "_pick_lookup_thread") and self._pick_lookup_thread.isRunning():
            self._pick_lookup_thread.quit()
            self._pick_lookup_thread.wait(1000)
        self._teardown_tree_change_notifier()
        super().closeEvent(event)

    def _on_server_tree_changed(self, version):
        if self.pick_overlay or self._pick_launch_pending:
            return
        if self._record_toolbar:
            return
        logger.debug(f"检测到服务端控件树变化，version={version}，自动刷新 sniff")
        self.client.request_widget_tree()

    def _refresh_widget_tree(self):
        """刷新控件树"""
        logger.info("用户请求刷新控件树")
        self.refresh_button.setEnabled(False)
        self.client.request_refresh_widget_tree()

    def _find_widgets(self):
        """查找控件"""
        try:
            widget_def = json.loads(self.widget_def_input.text().strip())
            if not widget_def:
                QMessageBox.warning(self, "提示", "请输入要查找的widget_def")
                return

            logger.info(f"用户请求查找控件: {widget_def}")
            self.find_widget_button.setEnabled(False)
            self.client.request_find_widgets(widget_def)
        except json.JSONDecodeError as e:
            logger.error(f"解析widget_def失败: {e}")
            QMessageBox.warning(self, "错误", f"widget_def格式错误: {e}")

    def _set_pick_status(self, text):
        self.pick_status_label.setText(text)

    def _set_pick_controls_enabled(self, enabled):
        self.pick_button.setEnabled(enabled)

    def _activate_target_application(self, silent=False):
        response = self.client.request_activate_application_window()
        ok = isinstance(response, dict) and not response.get("error")
        QApplication.processEvents()
        if not ok and not silent:
            logger.warning("激活被测应用窗口失败")
        return ok

    def _open_record_toolbar(self):
        if self.pick_overlay or self._pick_launch_pending:
            QMessageBox.information(
                self,
                "提示",
                "请先退出拾取模式再录制",
            )
            return
        if not self._activate_target_application(silent=True):
            QMessageBox.warning(
                self,
                "提示",
                "无法激活被测应用窗口，请确认服务端状态",
            )
            return
        if self._record_toolbar:
            self._record_toolbar.raise_()
            self._record_toolbar.activateWindow()
            return

        self._record_window_state = self.windowState()
        self.hide()
        QApplication.processEvents()

        self._record_toolbar = RecordingFloatingToolbar()
        self._record_toolbar.start_requested.connect(self._start_recording)
        self._record_toolbar.stop_requested.connect(self._stop_recording_and_restore)
        self._record_toolbar.closed.connect(self._on_record_toolbar_closed)
        self._record_toolbar.set_recording(False)
        self._record_toolbar.show()
        self._record_toolbar.raise_()
        self._record_toolbar.activateWindow()

    def _start_recording(self):
        if self._is_recording:
            return
        if not self._record_toolbar:
            return

        self._record_toolbar.set_status_text("状态: 正在启动...")
        if not self._activate_target_application(silent=True):
            self._record_toolbar.set_status_text("状态: 激活应用失败")
            QMessageBox.warning(
                self,
                "录制",
                "无法激活被测应用窗口，未启动录制",
            )
            return
        self.client.request_clear_record_events()
        response = self.client.request_start_recording()
        if response is None:
            self._record_toolbar.set_status_text("状态: 启动失败")
            return

        self._is_recording = True
        self._record_toolbar.set_recording(True)

    def _pull_all_record_events(self, limit=500):
        ack_token = 0
        events = []
        for _ in range(200):
            response = self.client.request_pull_record_events(
                limit=limit,
                ack_token=ack_token,
            )
            if response is None:
                return None
            batch = response.get("events") or []
            if not isinstance(batch, list):
                return None
            events.extend(batch)
            next_token = int(response.get("next_token", ack_token))
            if not batch or next_token <= ack_token:
                break
            ack_token = next_token
        return events

    def _generate_and_copy_record_script(self):
        events = self._pull_all_record_events()
        if events is None:
            QMessageBox.warning(
                self,
                "录制",
                "拉取录制事件失败，未生成脚本",
            )
            return

        code_text = generate_python_script(events, server_name=self.server_name)
        json_text = json.dumps(events, ensure_ascii=False, indent=2)
        QApplication.clipboard().setText(code_text)

        dialog = RecordResultDialog(
            code_text=code_text,
            json_text=json_text,
            event_count=len(events),
            parent=self,
        )
        dialog.exec_()

    def _stop_recording_and_restore(self):
        was_recording = self._is_recording
        if was_recording:
            self.client.request_stop_recording()
            self._is_recording = False
        self._close_record_toolbar(restore_window=True, stop_recording=False)
        if was_recording:
            self._generate_and_copy_record_script()

    def _on_record_toolbar_closed(self):
        was_recording = self._is_recording
        self._close_record_toolbar(restore_window=True, stop_recording=was_recording)
        if was_recording:
            self._generate_and_copy_record_script()

    def _close_record_toolbar(self, restore_window=True, stop_recording=False):
        toolbar = self._record_toolbar
        self._record_toolbar = None

        if stop_recording and self._is_recording:
            self.client.request_stop_recording()
            self._is_recording = False
        else:
            self._is_recording = False

        if toolbar:
            try:
                toolbar.start_requested.disconnect(self._start_recording)
                toolbar.stop_requested.disconnect(self._stop_recording_and_restore)
                toolbar.closed.disconnect(self._on_record_toolbar_closed)
            except Exception:
                pass
            toolbar.hide()
            toolbar.deleteLater()

        if restore_window:
            self.show()
            if self._record_window_state is not None:
                self.setWindowState(self._record_window_state)
            self.raise_()
            self.activateWindow()
            QApplication.processEvents()
        self._record_window_state = None

    def _start_widget_pick(self):
        if self.pick_overlay or self._pick_launch_pending:
            return

        logger.info("用户请求拾取控件")
        self._set_pick_controls_enabled(False)
        self._set_pick_status("正在准备拾取...")
        if not self._activate_target_application(silent=True):
            self._set_pick_controls_enabled(True)
            self._set_pick_status("")
            QMessageBox.warning(
                self,
                "提示",
                "无法激活被测应用窗口，请确认服务端状态",
            )
            return
        QApplication.processEvents()
        self.client.request_refresh_widget_tree()

        if not self.current_tree_nodes:
            self._set_pick_controls_enabled(True)
            self._set_pick_status("")
            QMessageBox.warning(self, "提示", "当前没有可拾取的控件")
            return

        self._picker_window_state = self.windowState()
        self.hide()
        QApplication.processEvents()

        self._hover_lookup_point = None
        self._confirm_lookup_point = None
        self._lookup_in_flight = False
        self._active_lookup = None
        self._pick_launch_pending = True
        self._set_pick_status("正在等待界面隐藏...")
        QTimer.singleShot(1000, self._show_pick_overlay)

    def _show_pick_overlay(self):
        if not self._pick_launch_pending or self.pick_overlay:
            return

        self._pick_launch_pending = False
        logger.info("开始截取屏幕并创建拾取覆盖层")
        screenshot, virtual_geometry = capture_virtual_desktop()
        if screenshot.isNull() or virtual_geometry.isNull():
            self._restore_main_window()
            self._set_pick_controls_enabled(True)
            self._set_pick_status("")
            QMessageBox.warning(self, "错误", "无法截取当前屏幕")
            return

        self.pick_overlay = ScreenPickOverlay(screenshot, virtual_geometry)
        self.pick_overlay.hover_point_changed.connect(self._on_overlay_hover)
        self.pick_overlay.point_confirmed.connect(self._on_overlay_confirmed)
        self.pick_overlay.cancelled.connect(self._on_overlay_cancelled)
        self.pick_overlay.show()
        self._hover_lookup_timer.start()
        logger.info("拾取覆盖层已显示")
        self._set_pick_status("移动鼠标选择控件，左键确认，右键或Esc取消")

    def _restore_main_window(self):
        self.show()
        if self._picker_window_state is not None:
            self.setWindowState(self._picker_window_state)
        self.raise_()
        self.activateWindow()
        self._picker_window_state = None
        QApplication.processEvents()

    def _close_pick_overlay(self, restore_window=True):
        if hasattr(self, "_hover_lookup_timer"):
            self._hover_lookup_timer.stop()

        overlay = self.pick_overlay
        self.pick_overlay = None
        self._pick_launch_pending = False
        self._hover_lookup_point = None
        self._confirm_lookup_point = None
        self._lookup_in_flight = False
        self._active_lookup = None

        if overlay:
            try:
                overlay.hover_point_changed.disconnect(self._on_overlay_hover)
                overlay.point_confirmed.disconnect(self._on_overlay_confirmed)
                overlay.cancelled.disconnect(self._on_overlay_cancelled)
            except Exception:
                pass
            overlay.close()
            overlay.deleteLater()

        if restore_window:
            self._restore_main_window()
            self._set_pick_controls_enabled(True)

    def _on_overlay_hover(self, x, y):
        if self._confirm_lookup_point is not None:
            return
        self._hover_lookup_point = (x, y)

    def _on_overlay_confirmed(self, x, y):
        if not self.pick_overlay:
            return

        self._confirm_lookup_point = (x, y)
        self._hover_lookup_point = None
        self.pick_overlay.setCursor(Qt.BusyCursor)
        self._set_pick_status("正在确认控件...")

        if not self._lookup_in_flight:
            self._dispatch_confirm_lookup()

    def _on_overlay_cancelled(self):
        logger.info("用户取消拾取控件")
        self._close_pick_overlay()
        self._set_pick_status("Pick cancelled")

    def _dispatch_hover_lookup(self):
        if not self.pick_overlay or self._lookup_in_flight or self._confirm_lookup_point:
            return
        if not self._hover_lookup_point:
            return

        x, y = self._hover_lookup_point
        self._hover_lookup_point = None
        self._emit_point_lookup(x, y, refresh=False, mode="hover")

    def _dispatch_confirm_lookup(self):
        if not self.pick_overlay or self._lookup_in_flight:
            return
        if not self._confirm_lookup_point:
            return

        x, y = self._confirm_lookup_point
        self._emit_point_lookup(x, y, refresh=True, mode="confirm")

    def _emit_point_lookup(self, x, y, refresh, mode):
        self._lookup_token += 1
        request = {
            "token": self._lookup_token,
            "x": x,
            "y": y,
            "refresh": refresh,
            "mode": mode,
        }
        self._active_lookup = request
        self._lookup_in_flight = True
        self.point_lookup_requested.emit(request)

    def _handle_picked_widget(self, widget_id):
        self.client.request_refresh_widget_tree()
        self._select_and_highlight_widget(widget_id, highlight=False)
        self.client.request_widget_info(widget_id)
        self.client.request_generate_widget_def(widget_id)

    def _on_point_lookup_finished(self, payload):
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
            widget_id = response.get("widget_id")
            self._close_pick_overlay()
            self._set_pick_status("Widget selected")
            self._handle_picked_widget(widget_id)
            return

        self._confirm_lookup_point = None
        if self.pick_overlay:
            self.pick_overlay.clear_highlight()
            self.pick_overlay.setCursor(Qt.CrossCursor)
        self._set_pick_status("No widget at current position")

    def _on_point_lookup_failed(self, payload):
        active_lookup = self._active_lookup
        if active_lookup and payload.get("token") != active_lookup.get("token"):
            return

        self._lookup_in_flight = False
        self._active_lookup = None
        mode = payload.get("mode")
        error = payload.get("error", "Unknown error")
        logger.error(f"拾取控件查询失败: {error}")

        if mode == "hover":
            if self._confirm_lookup_point is not None:
                self._dispatch_confirm_lookup()
            return

        self._confirm_lookup_point = None
        self._close_pick_overlay()
        self._set_pick_status("")
        self._show_error_dialog(error)

    def _show_context_menu(self, position: QPoint):
        """显示上下文菜单"""
        index = self.tree_view.indexAt(position)
        if not index.isValid():
            return

        # 创建菜单
        menu = QMenu(self)

        # 查看属性动作
        view_props_action = QAction("查看控件属性", self)
        view_props_action.triggered.connect(lambda: self._view_widget_properties(index))
        highlight_widget_action = QAction("高亮闪烁", self)
        highlight_widget_action.triggered.connect(lambda: self._hightlight_widget(index))
        generate_def_action = QAction("生成widget_def", self)
        generate_def_action.triggered.connect(lambda: self._generate_widget_def(index))

        menu.addAction(view_props_action)
        menu.addAction(highlight_widget_action)
        menu.addAction(generate_def_action)

        # 显示菜单
        menu.exec_(self.tree_view.viewport().mapToGlobal(position))

    def _on_item_clicked(self, index):
        """点击项目事件"""
        self._view_widget_properties(index)
        # 同时请求生成widget_def
        item = self.tree_model.itemFromIndex(index)
        widget_id = self.item_to_widget_id.get(id(item))
        if widget_id:
            self.client.request_generate_widget_def(widget_id)

    def _hightlight_widget(self, index):
        item = self.tree_model.itemFromIndex(index)
        widget_id = self.item_to_widget_id.get(id(item))
        if widget_id:
            self.client.request_highlight_widget(widget_id)

    def _view_widget_properties(self, index):
        """查看控件属性"""
        item = self.tree_model.itemFromIndex(index)
        widget_id = self.item_to_widget_id.get(id(item))
        if widget_id:
            self.client.request_widget_info(widget_id)

    def _on_item_double_clicked(self, index):
        """双击项目事件"""
        self._hightlight_widget(index)

    def _on_item_expanded(self, index):
        """节点展开事件"""
        item = self.tree_model.itemFromIndex(index)
        widget_id = self.item_to_widget_id.get(id(item))
        if widget_id:
            self.expanded_widget_ids.add(widget_id)

    def _on_item_collapsed(self, index):
        """节点折叠事件"""
        item = self.tree_model.itemFromIndex(index)
        widget_id = self.item_to_widget_id.get(id(item))
        if widget_id:
            self.expanded_widget_ids.discard(widget_id)

    def _on_selection_changed(self, selected, deselected):
        """选择改变事件"""
        indexes = selected.indexes()
        if indexes:
            index = indexes[0]  # 获取第一个选中的索引
            item = self.tree_model.itemFromIndex(index)
            widget_id = self.item_to_widget_id.get(id(item))
            if widget_id:
                self.selected_widget_id = widget_id

    def _save_tree_state(self):
        """保存当前选中状态"""
        # 保存当前选中项
        current_indexes = self.tree_view.selectionModel().selectedIndexes()
        if current_indexes:
            current_item = self.tree_model.itemFromIndex(current_indexes[0])
            self.selected_widget_id = self.item_to_widget_id.get(id(current_item))

    def _on_widget_tree_received(self, tree_data):
        """接收到控件树
        
        Args:
            tree_data: 控件树数据
        """
        logger.info("收到控件树数据")
        self.refresh_button.setEnabled(True)

        # 保存当前状态
        self._save_tree_state()

        # 数据验证
        if not tree_data:
            logger.warning("控件树数据为空")
            return
        tree_data = tree_data.to_dict()
        # 处理数据格式
        if isinstance(tree_data, dict):
            # 解析完整的树结构（包含VirtualRoot）
            try:
                root_node = WidgetTreeNode.from_dict(tree_data)
            except Exception as e:
                print(f"解析根节点失败: {e}, 数据: {tree_data}")
                return

            # 过滤掉VirtualRoot，只显示实际的顶级节点
            actual_top_nodes = [child for child in root_node.children
                                if child.type != 'VirtualRoot']
        else:
            print(f"错误：意外的数据类型 {type(tree_data)}，期望 dict 或 list")
            return

        if not self.current_tree_nodes:
            # 首次加载，直接构建树
            self.tree_model.clear()
            self.item_to_widget_id.clear()
            self.widget_id_to_item.clear()
            self.tree_model.setHorizontalHeaderLabels(["控件树"])

            for topnode in actual_top_nodes:
                self._populate_tree(topnode, None)
        else:
            # 增量更新
            if actual_top_nodes:
                # 创建虚拟根节点来处理多个顶级节点
                virtual_root = WidgetTreeNode(
                    widget_id='virtual_root',
                    type='VirtualRoot',
                    name='VirtualRoot',
                    text=""
                )
                virtual_root.children = actual_top_nodes
                self._incremental_update_tree(virtual_root)

        # 恢复展开和选择状态
        self._restore_tree_state()

    def _get_node_text(self, node: WidgetTreeNode) -> str:
        """获取节点显示文本"""
        return node.type + " - " + f'"{node.text}"' if node.text else node.type

    def _populate_tree(self, node: WidgetTreeNode, parent_item: QStandardItem):
        """填充树"""
        # 创建标准项
        name_item = QStandardItem(self._get_node_text(node))

        # 存储控件ID映射
        self.item_to_widget_id[id(name_item)] = node.widget_id
        self.widget_id_to_item[node.widget_id] = name_item
        self.current_tree_nodes[node.widget_id] = node

        if parent_item:
            parent_item.appendRow(name_item)
        else:
            self.tree_model.appendRow(name_item)

        # 递归添加子节点
        for child_node in node.children:
            self._populate_tree(child_node, name_item)

    def _incremental_update_tree(self, new_tree_node: WidgetTreeNode):
        """增量更新树结构"""
        if not new_tree_node:
            return

        # 保存新的树结构
        new_nodes = {}
        self._collect_all_nodes(new_tree_node, new_nodes)

        # 对比并更新
        for child_node in new_tree_node.children:
            self._update_node_recursive(child_node, None, new_nodes)

        # 清理已删除的节点
        self._cleanup_deleted_nodes(new_nodes)

        # 更新当前树结构
        self.current_tree_nodes = new_nodes

    def _collect_all_nodes(self, node: WidgetTreeNode, nodes_dict: dict):
        """收集所有节点到字典中"""
        nodes_dict[node.widget_id] = node
        for child in node.children:
            self._collect_all_nodes(child, nodes_dict)

    def _update_node_recursive(self, new_node: WidgetTreeNode, parent_item: QStandardItem, all_new_nodes: dict):
        """递归更新节点"""
        widget_id = new_node.widget_id
        existing_item = self.widget_id_to_item.get(widget_id)

        if existing_item:
            # 节点已存在，检查是否需要更新
            self._update_existing_node(existing_item, new_node)
        else:
            # 新节点，需要创建
            self._create_new_node(new_node, parent_item)

        # 递归处理子节点
        existing_item = self.widget_id_to_item.get(widget_id) if widget_id else None
        if existing_item:
            # 获取现有的子节点，找出需要删除的
            existing_children = self._get_existing_children_ids(existing_item)
            new_children_ids = {child.widget_id for child in new_node.children}

            # 删除已不存在的子节点
            for child_id in existing_children - new_children_ids:
                self._remove_node_by_id(child_id)

        # 递归更新子节点
        for child_node in new_node.children:
            self._update_node_recursive(child_node, existing_item, all_new_nodes)

    def _update_existing_node(self, item: QStandardItem, new_node: WidgetTreeNode):
        """更新现有节点的内容"""
        # 更新文本
        new_text = self._get_node_text(new_node)
        if item.text() != new_text:
            item.setText(new_text)

        # 更新映射
        self.current_tree_nodes[new_node.widget_id] = new_node

    def _create_new_node(self, node: WidgetTreeNode, parent_item: QStandardItem):
        """创建新节点"""
        name_item = QStandardItem(self._get_node_text(node))

        # 存储映射
        self.item_to_widget_id[id(name_item)] = node.widget_id
        self.widget_id_to_item[node.widget_id] = name_item

        if parent_item:
            parent_item.appendRow(name_item)
        else:
            self.tree_model.appendRow(name_item)

    def _get_existing_children_ids(self, parent_item: QStandardItem = None) -> set:
        """获取现有子节点的widget_id集合"""
        children_ids = set()
        items = []

        if parent_item:
            items = [parent_item.child(row, 0) for row in range(parent_item.rowCount())]
        else:
            items = [self.tree_model.item(row, 0) for row in range(self.tree_model.rowCount())]

        for child_item in items:
            widget_id = self.item_to_widget_id.get(id(child_item))
            if widget_id:
                children_ids.add(widget_id)

        return children_ids

    def _remove_node_by_id(self, widget_id: str):
        """根据widget_id删除节点"""
        if widget_id not in self.widget_id_to_item:
            return

        item = self.widget_id_to_item[widget_id]

        # 清理状态
        self.expanded_widget_ids.discard(widget_id)
        if self.selected_widget_id == widget_id:
            self.selected_widget_id = None

        # 递归删除子节点映射
        self._remove_children_from_mappings(item)

        # 从模型中删除
        parent = item.parent()
        if parent:
            parent.removeRow(item.row())
        else:
            self.tree_model.removeRow(item.row())

    def _remove_children_from_mappings(self, parent_item: QStandardItem):
        """递归删除子节点映射"""
        # 删除当前节点的映射
        widget_id = self.item_to_widget_id.get(id(parent_item))
        if widget_id:
            del self.item_to_widget_id[id(parent_item)]
            del self.widget_id_to_item[widget_id]
            if widget_id in self.current_tree_nodes:
                del self.current_tree_nodes[widget_id]

        # 递归删除子节点
        for row in range(parent_item.rowCount()):
            child_item = parent_item.child(row, 0)
            self._remove_children_from_mappings(child_item)

    def _cleanup_deleted_nodes(self, new_nodes: dict):
        """清理已删除的节点"""
        deleted_ids = set(self.current_tree_nodes.keys()) - set(new_nodes.keys())
        for widget_id in deleted_ids:
            self._remove_node_by_id(widget_id)

    def _restore_tree_state(self):
        """恢复树的展开状态和选择状态"""

        # 恢复展开状态
        def restore_expanded_items(parent_item=None):
            if parent_item is None:
                # 处理根节点
                for row in range(self.tree_model.rowCount()):
                    item = self.tree_model.item(row, 0)
                    widget_id = self.item_to_widget_id.get(id(item))
                    if widget_id and widget_id in self.expanded_widget_ids:
                        index = self.tree_model.indexFromItem(item)
                        self.tree_view.expand(index)
                    restore_expanded_items(item)
            else:
                # 处理子节点
                for row in range(parent_item.rowCount()):
                    child_item = parent_item.child(row, 0)
                    widget_id = self.item_to_widget_id.get(id(child_item))
                    if widget_id and widget_id in self.expanded_widget_ids:
                        index = self.tree_model.indexFromItem(child_item)
                        self.tree_view.expand(index)
                    restore_expanded_items(child_item)

        restore_expanded_items()

        # 恢复选择状态
        if self.selected_widget_id:
            def find_and_select_item(parent_item=None):
                if parent_item is None:
                    # 处理根节点
                    for row in range(self.tree_model.rowCount()):
                        item = self.tree_model.item(row, 0)
                        widget_id = self.item_to_widget_id.get(id(item))
                        if widget_id == self.selected_widget_id:
                            index = self.tree_model.indexFromItem(item)
                            self.tree_view.setCurrentIndex(index)
                            return True
                        if find_and_select_item(item):
                            return True
                else:
                    # 处理子节点
                    for row in range(parent_item.rowCount()):
                        child_item = parent_item.child(row, 0)
                        widget_id = self.item_to_widget_id.get(id(child_item))
                        if widget_id == self.selected_widget_id:
                            index = self.tree_model.indexFromItem(child_item)
                            self.tree_view.setCurrentIndex(index)
                            return True
                        if find_and_select_item(child_item):
                            return True
                return False

            find_and_select_item()

    def _on_widget_info_received(self, widget_info):
        """接收到控件信息"""
        # 更新属性表格
        self._update_properties_table(widget_info)

    def _on_find_widgets_received(self, results):
        """接收到查找控件结果
        
        Args:
            results: 查找结果列表
        """
        logger.info(f"收到查找结果: {len(results)}个控件")
        self.find_widget_button.setEnabled(True)

        if not results:
            logger.info("未找到匹配的控件")
            QMessageBox.information(self, "查找结果", "未找到匹配的控件")
            return

        # 显示结果对话框
        dialog = FindWidgetDialog(self)
        dialog.set_results(results)

        if dialog.exec_() == QDialog.Accepted:
            selected_widget_id = dialog.get_selected_widget_id()
            if selected_widget_id:
                self._select_and_highlight_widget(selected_widget_id)

    def _select_and_highlight_widget(self, widget_id, highlight=True):
        """选中并高亮指定控件"""
        # 在树中查找对应的项
        if widget_id in self.widget_id_to_item:
            item = self.widget_id_to_item[widget_id]
            index = self.tree_model.indexFromItem(item)

            # 展开父节点直到根节点
            self._expand_to_item(index)

            # 选中该项
            self.tree_view.setCurrentIndex(index)

            # 滚动到该项
            self.tree_view.scrollTo(index)

            # 高亮显示
            self.client.request_highlight_widget(widget_id)

    def _expand_to_item(self, index):
        """展开到指定项的所有父节点"""
        parent_index = index.parent()
        while parent_index.isValid():
            self.tree_view.expand(parent_index)
            parent_index = parent_index.parent()

    def _update_properties_table(self, widget_info):
        """更新属性表格"""
        # 清空表格
        self.properties_table.setRowCount(0)
        property_map = {
            "widget_id": "控件ID",
            "widget_type": "控件类型",
            "object_name": "对象名称",
            "position": "顶点位置",
            "size": "大小",
            "visible": "可见性",
            "enabled": "启用状态",
            "text": "文本"
        }
        properties = [(property_map.get(str(k), k), v) for k, v in widget_info.to_dict().items()]
        # 设置表格行数
        self.properties_table.setRowCount(len(properties))

        # 填充表格
        for row, (prop_name, prop_value) in enumerate(properties):
            name_item = QTableWidgetItem(prop_name)
            value_item = QTableWidgetItem(str(prop_value))

            # 设置项目不可编辑
            name_item.setFlags(name_item.flags() & ~Qt.ItemIsEditable)
            value_item.setFlags(value_item.flags() & ~Qt.ItemIsEditable)

            self.properties_table.setItem(row, 0, name_item)
            self.properties_table.setItem(row, 1, value_item)

    def _on_error_received(self, error_msg: str):
        """接收到错误
        
        Args:
            error_msg: 错误消息
        """
        # 重新启用按钮
        self.refresh_button.setEnabled(True)
        self.find_widget_button.setEnabled(True)
        self.pick_button.setEnabled(True)
        self.record_button.setEnabled(True)

        # 记录错误日志
        logger.error(f"收到服务端错误: {error_msg}")

        # 显示详细的错误对话框
        self._show_error_dialog(error_msg)

    def _show_error_dialog(self, error_msg: str):
        """显示详细的错误对话框
        
        Args:
            error_msg: 错误消息（可能包含JSON格式的详细信息）
        """
        # 尝试解析错误消息为JSON
        try:
            error_data = json.loads(error_msg) if error_msg.startswith('{') else {"error": error_msg}
        except Exception:
            error_data = {"error": error_msg}

        # 创建错误对话框
        dialog = QDialog(self)
        dialog.setWindowTitle("错误详情")

        # 高DPI优化：根据屏幕DPI调整对话框大小
        screen = QApplication.primaryScreen()
        dpi = screen.logicalDotsPerInch()
        scale_factor = dpi / 96.0

        base_width = 600
        base_height = 400
        dialog.resize(int(base_width * scale_factor), int(base_height * scale_factor))
        dialog.setMinimumSize(int(500 * scale_factor), int(350 * scale_factor))

        layout = QVBoxLayout(dialog)

        # 错误类型和消息
        error_type = error_data.get("error_type", "未知错误")
        error_message = error_data.get("error", "未知错误消息")

        # 添加错误信息标签
        error_label = QLabel(f"<b>错误类型:</b> {error_type}<br><b>错误消息:</b> {error_message}")
        error_label.setWordWrap(True)
        layout.addWidget(error_label)

        # 如果有堆栈跟踪，显示在文本框中
        if "traceback" in error_data:
            traceback_label = QLabel("<b>堆栈跟踪:</b>")
            layout.addWidget(traceback_label)

            traceback_text = QTextEdit()
            traceback_text.setPlainText(error_data["traceback"])
            traceback_text.setReadOnly(True)
            layout.addWidget(traceback_text)

        # 添加按钮
        button_layout = QHBoxLayout()

        copy_button = QPushButton("复制错误信息")
        copy_button.clicked.connect(lambda: self._copy_error_to_clipboard(error_data))
        button_layout.addWidget(copy_button)

        close_button = QPushButton("关闭")
        close_button.clicked.connect(dialog.close)
        button_layout.addWidget(close_button)

        layout.addLayout(button_layout)

        dialog.exec_()

    def _copy_error_to_clipboard(self, error_data: dict):
        """复制错误信息到剪贴板
        
        Args:
            error_data: 错误数据字典
        """
        error_text = f"错误类型: {error_data.get('error_type', '未知')}\n"
        error_text += f"错误消息: {error_data.get('error', '未知')}\n"
        if "traceback" in error_data:
            error_text += f"\n堆栈跟踪:\n{error_data['traceback']}"

        clipboard = QApplication.clipboard()
        clipboard.setText(error_text)
        # QMessageBox.information(self, "成功", "错误信息已复制到剪贴板")

    def _generate_widget_def(self, index):
        """生成widget_def定义
        
        Args:
            index: 树视图中的索引
        """
        item = self.tree_model.itemFromIndex(index)
        widget_id = self.item_to_widget_id.get(id(item))

        if not widget_id:
            logger.warning("无法获取控件ID")
            QMessageBox.warning(self, "警告", "无法获取控件ID")
            return

        logger.info(f"用户请求生成widget_def: {widget_id}")
        # 请求服务端生成widget_def
        self.client.request_generate_widget_def(widget_id)

    def _on_widget_def_received(self, widget_def_data):
        """接收到生成的widget_def

        Args:
            widget_def_data: 包含widget_def、occurrence和match_count的字典
        """
        widget_def = widget_def_data.get("widget_def", {})
        occurrence = widget_def_data.get("occurrence", 1)
        match_count = widget_def_data.get("match_count", 1)

        logger.info(f"收到生成的widget_def: {widget_def}, 匹配数: {match_count}")

        # 格式化为JSON字符串
        widget_def_str = json.dumps(widget_def, ensure_ascii=False, indent=2)

        # 更新textedit控件
        self.widget_def_textedit.setPlainText(widget_def_str)

        # 启用复制按钮
        self.copy_widget_def_button.setEnabled(True)

    def _on_widget_def_text_changed(self):
        """widget_def文本改变事件"""
        # 根据文本内容是否为空来启用/禁用复制按钮
        has_text = bool(self.widget_def_textedit.toPlainText().strip())
        self.copy_widget_def_button.setEnabled(has_text)

    def _ele_type(self, ele):
        """
        匹配元素类型
        ele: 元素
        return: 返回元素类型
        """
        ele_type = None

        # 获取 ele_type 的值，用于后续类型匹配
        ele_type_value = ele.get("type").lower()
        # 遍历 ele_type 中的每种类型
        ele_type_config = setting.ELE_TYPE
        for type_name, type_list in setting.ELE_TYPE.items():
            for _type in type_list:
                if _type.lower() in ele_type_value:
                    ele_type = type_name
                    break
            if ele_type:
                break

        ele_text = ele.get("text")

        if ele_type is None:
            def_name = "1_请到dancemonkey/_setting.py下完善ELE_TYPE"
        elif not ele_text:
            def_name = "1_该元素没有text请以Sailwind英文环境下显示的名称结合其type命名"
        else:
            def_name = f"{ele_text}_{ele_type}".replace(" ", "_").replace("-", "_").replace(".", "_").replace("/", "_").lower()

        return def_name

    def _copy_widget_def_to_clipboard(self):
        """复制widget_def到剪贴板"""
        text = self.widget_def_textedit.toPlainText()
        if text:
            text_json = json.loads(text)
            intend_attr = text.strip().splitlines()
            text_line = [intend_attr[0]] + [3 * "    " + line for line in intend_attr[1:]]
            attr_text = "\n".join(text_line)
            def_name = self._ele_type(text_json)
            if text_json.get("text"):
                tr_text = """{
                "zh_CN": ""
            }"""
                resolved_text = f"""
    @property
    def {def_name}(self):
        return Ele(
            desc="",
            attr={attr_text},
            tr={tr_text}
        )
        """
            else:
                resolved_text = f"""
    @property
    def {def_name}(self):
        return Ele(
            desc="",
            attr={attr_text},
        )
        """
            clipboard = QApplication.clipboard()
            clipboard.setText(resolved_text)
            logger.info("widget_def已复制到剪贴板")
            # QMessageBox.information(self, "成功", "widget_def已复制到剪贴板")
