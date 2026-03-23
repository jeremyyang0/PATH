from typing import Dict, Any, List


class WidgetInfo:
    """控件信息"""

    def __init__(self, widget_id: str, type: str = "", name: str = "",
                 position: tuple = (-1, -1), size: tuple = (0, 0), visible: bool = False, enabled: bool = False,
                 text: str = ""):
        self.widget_id = widget_id
        self.type = type
        self.name = name
        self.position = position  # (x, y)
        self.size = size  # (width, height)
        self.visible = visible
        self.enabled = enabled
        self.text = text
        self.widget_model = "widget"

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "widget_id": self.widget_id,
            "type": self.type,
            "name": self.name,
            "position": self.position,
            "size": self.size,
            "visible": self.visible,
            "enabled": self.enabled,
            "text": self.text,
            "widget_model": self.widget_model
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'WidgetInfo':
        """从字典创建控件信息对象"""
        return cls(**data)


class ActionInfo:
    def __init__(self, widget_id: str, type: str = "",
                 position: tuple = (-1, -1), size: tuple = (0, 0), enabled: bool = False,
                 text: str = "", tooltip: str = "", index: int = 0, visible: bool = False):
        self.widget_id = widget_id
        self.type = type
        self.position = position  # (x, y)
        self.size = size  # (width, height)
        self.enabled = enabled
        self.text = text
        self.tooltip = tooltip
        self.widget_model = "action"
        self.index = index
        self.visible = visible

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "widget_id": self.widget_id,
            "type": self.type,
            "position": self.position,
            "size": self.size,
            "enabled": self.enabled,
            "text": self.text,
            "tooltip": self.tooltip,
            "widget_model": self.widget_model,
            "index": self.index,
            "visible": self.visible
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ActionInfo':
        """从字典创建控件信息对象"""
        return cls(**data)


class TreeViewItemsInfo:
    def __init__(self, widget_id: str, type: str = "", parent_view: str = "",
                 position: tuple = (-1, -1), size: tuple = (0, 0),
                 text: str = "", selected: bool = False, visible: bool = False):
        self.widget_id = widget_id
        self.type = type
        self.parent_view = parent_view
        self.position = position  # (x, y)
        self.size = size  # (width, height)
        self.text = text
        self.selected = selected
        self.visible = visible
        self.widget_model = "treeviewitem"

    def to_dict(self):
        return {
            "widget_id": self.widget_id,
            "type": self.type,
            "parent_view": self.parent_view,
            "position": self.position,
            "size": self.size,
            "text": self.text,
            "selected": self.selected,
            "visible": self.visible,
            "widget_model": self.widget_model
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TreeViewItemsInfo':
        """从字典创建控件树节点对象"""
        return cls(**data)


class TableViewItemInfo(TreeViewItemsInfo):
    def __init__(self, widget_id: str, type: str = "", parent_view: str = "",
                 position: tuple = (-1, -1), size: tuple = (0, 0),
                 text: str = "", selected: bool = False, row: int = -1, column: int = -1, visible: bool = False):
        super().__init__(widget_id, type, parent_view, position, size, text, selected, visible)
        self.widget_model = "tableviewitem"
        self.row = row
        self.column = column
        self.visible = visible

    def to_dict(self):
        return {
            "widget_id": self.widget_id,
            "type": self.type,
            "parent_view": self.parent_view,
            "position": self.position,
            "size": self.size,
            "text": self.text,
            "selected": self.selected,
            "row": self.row,
            "column": self.column,
            "visible": self.visible,
            "widget_model": self.widget_model
        }


class TableWidgetItemInfo(TableViewItemInfo):
    def __init__(self, widget_id: str, type: str = "", parent_view: str = "",
                 position: tuple = (-1, -1), size: tuple = (0, 0),
                 text: str = "", selected: bool = False, row: int = -1, column: int = -1, visible: bool = False):
        super().__init__(widget_id, type, parent_view, position, size, text, selected, row, column, visible)
        self.widget_model = "tablewidgetitem"


class TreeWidgetItemInfo(TreeViewItemsInfo):
    def __init__(self, widget_id: str, type: str = "", parent_view: str = "",
                 position: tuple = (-1, -1), size: tuple = (0, 0),
                 text: str = "", selected: bool = False, visible: bool = False):
        super().__init__(widget_id, type, parent_view, position, size, text, selected, visible)
        self.widget_model = "treewidgetitem"


class ListViewItemsInfo(TreeViewItemsInfo):
    def __init__(self, widget_id: str, type: str = "", parent_view: str = "",
                 position: tuple = (-1, -1), size: tuple = (0, 0),
                 text: str = "", selected: bool = False, index: int = 0, visible: bool = False):
        super().__init__(widget_id, type, parent_view, position, size, text, selected, visible)
        self.index = index
        self.widget_model = "listviewitem"


class ComboBoxViewItemsInfo(ListViewItemsInfo):
    def __init__(self, widget_id: str, type: str = "", parent_view: str = "",
                 position: tuple = (-1, -1), size: tuple = (0, 0),
                 text: str = "", selected: bool = False, index: int = 0, visible: bool = False):
        super().__init__(widget_id, type, parent_view, position, size, text, selected, index, visible)
        self.widget_model = "comboboxviewitem"


class ModelIndexItemInfo:
    def __init__(
            self,
            widget_id: str,
            type: str = "",
            parent_view: str = "",
            index_path: List = None,
            row: int = -1,
            column: int = -1,
            position: tuple = (-1, -1),
            size: tuple = (0, 0),
            text: str = "",
            selected: bool = False,
            visible: bool = False,
    ):
        self.widget_id = widget_id
        self.type = type
        self.parent_view = parent_view
        self.index_path = index_path or []
        self.row = row
        self.column = column
        self.position = position
        self.size = size
        self.text = text
        self.selected = selected
        self.visible = visible
        self.widget_model = "modelindexitem"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "widget_id": self.widget_id,
            "type": self.type,
            "parent_view": self.parent_view,
            "index_path": self.index_path,
            "row": self.row,
            "column": self.column,
            "position": self.position,
            "size": self.size,
            "text": self.text,
            "selected": self.selected,
            "visible": self.visible,
            "widget_model": self.widget_model,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ModelIndexItemInfo':
        return cls(**data)


class TabInfo:
    def __init__(self, widget_id: str, type: str, name: str, text: str, position: tuple = (-1, -1),
                 size: tuple = (0, 0), enabled: bool = False, tooltip: str = "", selected: bool = False,
                 parent_tabbar: str = "",
                 index: int = 0, visible: bool = False):
        self.widget_id = widget_id
        self.type = type
        self.name = name
        self.text = text
        self.position = position
        self.parent_tabbar = parent_tabbar
        self.size = size
        self.enabled = enabled
        self.tooltip = tooltip
        self.index = index
        self.selected = selected
        self.visible = visible
        self.widget_model = "tabitem"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "widget_id": self.widget_id,
            "type": self.type,
            "name": self.name,
            "text": self.text,
            "position": self.position,
            "size": self.size,
            "enabled": self.enabled,
            "tooltip": self.tooltip,
            "index": self.index,
            "selected": self.selected,
            "visible": self.visible,
            "widget_model": self.widget_model
        }

    @classmethod
    def from_dict(cls, data):
        return cls(**data)


class WidgetTreeNode:
    """控件树节点"""

    def __init__(self, widget_id: str, type: str, name: str, text: str,
                 children: List['WidgetTreeNode'] = None):
        self.widget_id = widget_id
        self.type = type
        self.text = text
        self.name = name
        self.children = children or []

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "widget_id": self.widget_id,
            "type": self.type,
            "name": self.name,
            "text": self.text,
            "children": [child.to_dict() for child in self.children]
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'WidgetTreeNode':
        """从字典创建控件树节点对象"""
        children = []
        for child in data.get("children", []):
            if isinstance(child, dict):
                children.append(cls.from_dict(child))
            else:
                print(f"警告：子节点数据类型不正确 {type(child)}，期望 dict，跳过该节点")

        return cls(
            data["widget_id"],
            data["type"],
            data["name"],
            data["text"],
            children
        )
