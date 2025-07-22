# Ele Tree Viewer 使用示例

## 🚀 快速上手指南

### 1. 基本使用流程

```
1. 打开包含Python代码的工作区
2. 点击VSCode侧边栏的"Ele变量树"图标
3. 点击刷新按钮加载数据
4. 浏览树形结构中的Ele变量
```

### 2. 新功能使用示例

## 📁 树形结构展示

```
📦 原理图
 ├── 📁 原理图编辑器
 │   ├── 📁 对话框
 │   │   └── 📁 添加部件
 │   │       ├── 🔹 添加部件按钮      ← Ele变量（可拖拽）
 │   │       ├── 🔹 删除部件按钮      ← Ele变量（可拖拽）
 │   │       └── 🔹 更多按钮          ← Ele变量（可拖拽）
 │   └── 📁 画布
 │       ├── 🔹 确定按钮
 │       └── 🔹 取消按钮
 └── 📁 部件编辑器
     └── 🔹 保存按钮
```

## 🎯 拖拽功能演示

### 拖拽前（树形视图）
```
📁 添加部件
 ├── 🔹 添加部件按钮    ← 右键选择此项
 └── 🔹 删除部件按钮
```

### 拖拽后（编辑器中）
```python
# 拖拽后自动插入完整路径
logic.logic_editor.dialog.add_part.add_part_button
```

## ⚡ 右键菜单"添加操作"功能

### 步骤1：选择Ele变量
```
🔹 添加部件按钮  ← 右键点击此项
```

### 步骤2：选择操作类型
```
右键菜单：
┌─────────────────┐
│ 拖拽到编辑器     │
│ ────────────── │
│ 添加操作    ▶   │ ──┐
└─────────────────┘   │
                     │
                     ▼
                 ┌─────────┐
                 │ 点击    │
                 │ 双击    │
                 └─────────┘
```

### 步骤3：自动生成代码

#### 原始Ele文件 (`add_part_ele.py`)
```python
from pzauto import Ele

class names:
    add_part_window = {"name": "add_part_window", "type": "window"}
    add_part_button_ele = {"name": "add_part_button_ele", "type": "button", "window": add_part_window}
    delete_part_button_ele = {"name": "delete_part_button_ele", "type": "button", "window": add_part_window}

class addPartEle:
    def __init__(self):
        self.add_part_button = Ele(attr=names.add_part_button_ele, desc='添加部件按钮')
        self.delete_part_button = Ele(attr=names.delete_part_button_ele, desc='删除部件按钮')
```

#### 自动生成的原子方法文件 (`add_part.py`)
```python
from method.logic.logic_editor.dialog.add_part.add_part_ele import addPartEle

class _BaseAddPartMethod(addPartEle):
    """基础添加部件方法"""
    
    def click_add_part_button(self):
        """点击 add_part_button"""
        self.add_part_button.click()
    
    def double_click_add_part_button(self):
        """双击 add_part_button"""
        self.add_part_button.double_click()

class AddPartMethod(_BaseAddPartMethod):
    """组合添加部件方法"""
    ...
```

## 🔍 搜索功能演示

### 搜索前
```
📦 原理图
 ├── 📁 原理图编辑器
 │   ├── 📁 对话框
 │   │   └── 📁 添加部件
 │   │       ├── 🔹 添加部件按钮
 │   │       ├── 🔹 删除部件按钮
 │   │       └── 🔹 更多按钮
 │   └── 📁 画布
 │       ├── 🔹 确定按钮
 │       └── 🔹 取消按钮
 └── 📁 部件编辑器
     └── 🔹 保存按钮
```

### 搜索"按钮"后
```
📦 原理图
 ├── 📁 原理图编辑器
 │   ├── 📁 对话框
 │   │   └── 📁 添加部件
 │   │       ├── 🔹 添加部件按钮    ← 匹配
 │   │       └── 🔹 删除部件按钮    ← 匹配
 │   └── 📁 画布
 │       ├── 🔹 确定按钮           ← 匹配
 │       └── 🔹 取消按钮           ← 匹配
 └── 📁 部件编辑器
     └── 🔹 保存按钮               ← 匹配
```

## 🛠️ 工具栏功能

```
工具栏按钮：
┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
│ 🔄  │ │ ⬇️  │ │ ⬆️  │ │ 🔍  │ │ ❌  │
│刷新 │ │展开 │ │收起 │ │搜索 │ │清除 │
└─────┘ └─────┘ └─────┘ └─────┘ └─────┘
```

## 💡 使用技巧

### 1. 快速定位元素
- 使用搜索功能快速找到特定元素
- 支持中文描述和英文变量名搜索
- 搜索结果保持层级结构

### 2. 批量操作
- 可以为多个元素快速添加相同类型的操作
- 生成的方法会自动添加到同一个类中

### 3. 代码组织
- 原子方法按照目录结构自动组织
- Base类包含基础操作方法
- 组合类可以继承Base类进行扩展

### 4. 编码规范
- 自动生成的代码遵循Python编码规范
- 方法名采用下划线命名法
- 自动添加文档字符串

## 🔧 故障排除

### 问题1：右键菜单不显示"添加操作"
**解决方案**：
- 确保右键点击的是Ele变量节点（叶子节点）
- 文件夹节点不会显示此菜单

### 问题2：生成的文件路径不正确
**解决方案**：
- 检查工作区根目录是否包含method文件夹
- 确保文件命名符合 `xxx_ele.py` 格式

### 问题3：无法找到对应的原子方法文件
**解决方案**：
- 系统会自动创建不存在的文件
- 确保有写入权限

### 问题4：展开全部功能不生效
**解决方案**：
- 确保使用的是v0.0.3或更高版本
- 尝试刷新树形视图

## 📈 性能优化建议

1. **大型项目优化**：
   - 使用搜索功能缩小查看范围
   - 避免同时展开过多节点

2. **文件操作优化**：
   - 生成方法后会自动保存，无需手动保存
   - 建议定期备份自动生成的文件

3. **编码效率**：
   - 合理使用拖拽功能插入路径
   - 利用自动生成功能减少重复代码编写 