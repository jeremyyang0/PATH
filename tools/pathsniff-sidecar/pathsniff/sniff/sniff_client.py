from PySide2.QtCore import Signal

from pathsniff.shared.models import *
from pathsniff.sniff.baseclient import RouterHttpClient


class WidgetTreeClient(RouterHttpClient):
    """控件树客户端"""

    # 信号：当接收到控件树时发出
    widget_tree_received = Signal(object)  # WidgetTreeNode
    # 信号：当接收到控件信息时发出
    widget_info_received = Signal(object)  # WidgetInfo
    # 信号：当发生错误时发出
    error_received = Signal(str)
    # 信号：当接收到查找控件结果时发出
    find_widgets_received = Signal(list)
    # 信号：当接收到生成的widget_def时发出
    widget_def_received = Signal(dict)
    widget_at_point_received = Signal(dict)

    def __init__(self, server_name: str = "common"):
        super().__init__(server_name)

    @staticmethod
    def _is_unknown_path_error(err) -> bool:
        return "unknown path" in str(err).lower()

    def request_find_widgets(self, widget_def):
        try:
            res = self.post('search_widget', {"widget_def": widget_def})
            if not isinstance(res, list):
                raise RuntimeError(res.get('error'))
            resp = [WidgetTreeNode.from_dict(item) for item in res]
            self.find_widgets_received.emit(resp)
        except Exception as e:
            self.error_received.emit(f"{e}")

    def request_widget_tree(self):
        """请求控件树"""
        try:
            res = self.post('get_widget_tree')
            if res.get('success'):
                self.widget_tree_received.emit(None)
            else:
                tree_node = WidgetTreeNode.from_dict(res)
                self.widget_tree_received.emit(tree_node)
        except Exception as e:
            self.error_received.emit(f"Error processing widget tree: {e}")

    def request_widget_info(self, widget_id: str):
        """请求控件信息"""
        try:
            res = self.post('get_widget_info', {"widget_id": widget_id})
            widget_model = res.pop("widget_model", None)
            if widget_model == "treeviewitem":
                widget_info = TreeViewItemsInfo.from_dict(res)
            elif widget_model == "tableviewitem":
                widget_info = TableViewItemInfo.from_dict(res)
            elif widget_model == "tablewidgetitem":
                widget_info = TableWidgetItemInfo.from_dict(res)
            elif widget_model == "treewidgetitem":
                widget_info = TreeWidgetItemInfo.from_dict(res)
            elif widget_model == "listviewitem":
                widget_info = ListViewItemsInfo.from_dict(res)
            elif widget_model == "comboboxviewitem":
                widget_info = ComboBoxViewItemsInfo.from_dict(res)
            elif widget_model == "modelindexitem":
                widget_info = ModelIndexItemInfo.from_dict(res)
            elif widget_model == "action":
                widget_info = ActionInfo.from_dict(res)
            elif widget_model == "tabitem":
                widget_info = TabInfo.from_dict(res)
            elif widget_model == "widget":
                widget_info = WidgetInfo.from_dict(res)
            else:
                raise AttributeError("非法控件模型")
            self.widget_info_received.emit(widget_info)
        except Exception as e:
            self.error_received.emit(f"Error processing widget info: {e}")

    def request_refresh_widget_tree(self):
        """请求刷新控件树"""
        try:
            res = self.post('refresh_widget_tree')
            if res.get('success'):
                self.widget_tree_received.emit(None)
            else:
                tree_node = WidgetTreeNode.from_dict(res)
                self.widget_tree_received.emit(tree_node)
        except Exception as e:
            self.error_received.emit(f"Error processing refresh widget tree: {e}")

    def request_widget_tree_version(self):
        try:
            res = self.post("get_widget_tree_version")
            if res.get("error"):
                raise RuntimeError(res.get("error"))
            return int(res.get("version", 0))
        except Exception as e:
            self.error_received.emit(f"Error getting widget tree version: {e}")
            return None

    def request_wait_widget_tree_change(self, last_version: int, timeout_ms: int = 4500):
        try:
            res = self.post(
                "wait_widget_tree_change",
                {"last_version": int(last_version), "timeout_ms": int(timeout_ms)},
            )
            if res.get("error"):
                raise RuntimeError(res.get("error"))
            return res
        except Exception as e:
            self.error_received.emit(f"Error waiting widget tree change: {e}")
            return None

    def request_register_tree_change_notifier(self, channel_name: str):
        try:
            res = self.post("register_tree_change_notifier", {"channel_name": channel_name})
            if res.get("error"):
                if self._is_unknown_path_error(res.get("error")):
                    return {"success": False, "unsupported": True}
                raise RuntimeError(res.get("error"))
            return res
        except Exception as e:
            if self._is_unknown_path_error(e):
                return {"success": False, "unsupported": True}
            self.error_received.emit(f"Error registering tree notifier: {e}")
            return None

    def request_unregister_tree_change_notifier(self, channel_name: str):
        try:
            res = self.post("unregister_tree_change_notifier", {"channel_name": channel_name})
            if res.get("error"):
                if self._is_unknown_path_error(res.get("error")):
                    return {"success": False, "unsupported": True}
                raise RuntimeError(res.get("error"))
            return res
        except Exception as e:
            if self._is_unknown_path_error(e):
                return {"success": False, "unsupported": True}
            self.error_received.emit(f"Error unregistering tree notifier: {e}")
            return None

    def request_activate_application_window(self):
        try:
            res = self.post('activate_application_window')
            if res.get('error'):
                raise RuntimeError(res.get('error'))
            return res
        except Exception as e:
            self.error_received.emit(f"Error activating application window: {e}")
            return None

    def request_highlight_widget(self, widget_id: str):
        """请求高亮控件"""
        try:
            res = self.post('highlight_widget', {"widget_id": widget_id})
            if not res.get("success"):
                raise RuntimeError('高亮控件失败')
        except Exception as e:
            self.error_received.emit(f"Error processing highlight widget: {e}")

    def request_generate_widget_def(self, widget_id: str):
        """请求生成widget_def
        
        Args:
            widget_id: 控件ID
        """
        try:
            res = self.post('generate_widget_def', {"widget_id": widget_id})
            if res.get('error'):
                raise RuntimeError(res.get('error'))
            self.widget_def_received.emit(res)
        except Exception as e:
            self.error_received.emit(f"Error generating widget_def: {e}")

    def request_find_widget_by_point(self, x: int, y: int, refresh: bool = False):
        try:
            res = self.post(
                'find_widget_by_point',
                {"x": x, "y": y, "refresh": refresh},
            )
            if res.get('error'):
                raise RuntimeError(res.get('error'))
            self.widget_at_point_received.emit(res)
        except Exception as e:
            self.error_received.emit(f"Error finding widget by point: {e}")

    def request_start_recording(self, options=None):
        try:
            res = self.post("start_recording", {"options": options or {}})
            if res.get("error"):
                raise RuntimeError(res.get("error"))
            return res
        except Exception as e:
            self.error_received.emit(f"Error starting recording: {e}")
            return None

    def request_stop_recording(self):
        try:
            res = self.post("stop_recording")
            if res.get("error"):
                raise RuntimeError(res.get("error"))
            return res
        except Exception as e:
            self.error_received.emit(f"Error stopping recording: {e}")
            return None

    def request_pull_record_events(self, limit: int = 200, ack_token: int = 0):
        try:
            res = self.post(
                "pull_record_events",
                {"limit": limit, "ack_token": ack_token},
            )
            if res.get("error"):
                raise RuntimeError(res.get("error"))
            return res
        except Exception as e:
            self.error_received.emit(f"Error pulling record events: {e}")
            return None

    def request_clear_record_events(self):
        try:
            res = self.post("clear_record_events")
            if res.get("error"):
                raise RuntimeError(res.get("error"))
            return res
        except Exception as e:
            self.error_received.emit(f"Error clearing record events: {e}")
            return None
