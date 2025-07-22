# 中文包名映射功能说明

## 功能介绍

Ele Tree Viewer 现在支持将树形结构中的英文文件夹名替换为中文名称。每个Python包的`__init__.py`文件中定义的类会被解析，以提取包的中文名称。

## 工作原理

1. **扫描包结构**: 插件会递归扫描`method`目录下的所有Python包（包含`__init__.py`文件的目录）

2. **提取中文名称**: 从每个包的`__init__.py`文件中提取中文名称，支持以下方式：
   - 类名本身包含中文字符
   - 类中的属性（name、display_name、title、chinese_name、desc、description）
   - 类文档字符串（docstring）

3. **显示映射**: 在树形结构中，英文目录名会被替换为对应的中文名称

## 示例

### __init__.py 文件示例

```python
# method/logic/logic_editor/__init__.py
class LogicEditor:
    name = "逻辑编辑器"
    description = "用于编辑逻辑流程的编辑器"
```

或者：

```python
# method/logic/logic_editor/__init__.py
class 逻辑编辑器:
    """逻辑编辑器类"""
    pass
```

### 树形结构显示

**原始英文路径**:
```
logic
  └── logic_editor
      └── dialog
          └── add_part
```

**中文显示**:
```
逻辑
  └── 逻辑编辑器
      └── 对话框
          └── 添加部件
```

## 支持的属性名

插件会查找以下属性来获取中文名称：
- `name`
- `display_name`
- `title`
- `chinese_name`
- `desc`
- `description`

## 注意事项

1. **文件格式**: 确保`__init__.py`文件使用UTF-8编码
2. **类定义**: 每个包的`__init__.py`文件中至少要有一个类定义
3. **中文字符**: 插件会自动检测中文字符（Unicode范围：\u4e00-\u9fff）
4. **优先级**: 类名 > 属性值 > 文档字符串
5. **缓存**: 包名映射会在插件启动时缓存，修改后需要刷新

## 故障排除

### 中文名称未显示
1. 检查`__init__.py`文件是否存在
2. 确认类定义中包含中文字符
3. 验证文件编码为UTF-8
4. 尝试刷新树形视图

### 部分路径仍为英文
1. 检查对应包的`__init__.py`文件
2. 确认中文名称提取规则
3. 查看控制台错误信息

## 测试验证

使用测试脚本验证功能：
```bash
python test_chinese_names.py
```

该脚本会显示：
- 发现的包名映射
- 解析结果统计
- 示例文件信息 