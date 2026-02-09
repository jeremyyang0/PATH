# 禅道集成

PATH 插件深度集成禅道（Zentao）项目管理系统，支持自动拉取用例信息、生成测试脚本模板。

## 功能概述

- 自动获取禅道用例的标题、前置条件、测试步骤
- 将测试步骤转换为代码注释
- 自动生成符合项目规范的测试脚本模板
- 智能计算文件名 ID，避免重复

## 配置说明

在 VSCode 设置中（`Ctrl+,`，搜索 `path.zentao`）配置：

| 配置项 | 说明 | 示例 |
|--------|------|------|
| path.zentao.host | 禅道服务器地址 | `10.0.18.30` |
| path.zentao.username | 禅道用户名 | `automation` |
| path.zentao.password | 禅道密码 | - |

## 创建测试用例

### 操作步骤

1. 在 VSCode 资源管理器中，右键点击目标文件夹或文件
2. 选择 **Create Case (创建用例)**
3. 在弹出的输入框中输入禅道用例 ID（可选）
   - 输入 ID：从禅道拉取用例信息，生成完整模板
   - 回车跳过：生成基础空模板
4. 输入应用名称（如已配置 `path.appName`，自动跳过）
5. 插件自动生成测试文件并打开

### 文件命名规则

文件名格式：`test_<folder_name>_<id>.py`

- `folder_name`：目标文件夹名称
- `id`：三位数字，自动递增（001、002、003...）

**自动计算**：插件会扫描文件夹中已有的测试文件，计算下一个可用 ID。

例如，文件夹中已有 `test_login_001.py` 和 `test_login_002.py`，新建文件自动命名为 `test_login_003.py`。

## 生成的模板

### 完整模板（有禅道 ID）

```python
# -*- coding: utf-8 -*-
"""
测试用例文件: test_login_003.py
禅道ID: 12345
用例标题: 打开sch文件
"""
from method.logic import LogicExport
from case.base_case import BaseCase

class TestLogic(BaseCase):

    def test_logic_003(self, logic: LogicExport):
        """用户登录功能测试"""
        # 步骤 1: 打开Logic
        # 预期 1: Logic打开成功
        
        # 步骤 2: 打开一个sch文件
        # 预期 2: 打开成功
```

### 最小模板（无禅道 ID）

```python
# -*- coding: utf-8 -*-
"""
测试用例文件: test_login_003.py
"""
from method.logic import LogicExport
from case.base_case import BaseCase

class TestLogic(BaseCase):

    def test_login_003(self, logic: LogicExport):
        """测试用例"""
        # TODO: 实现逻辑
```

## 应用名称配置

如果项目中所有测试用例使用同一个应用名称，可以在设置中配置：

```json
{
    "path.appName": "Logic"
}
```

配置后，创建用例时不再弹出应用名称输入框。

**验证规则**：应用名称必须为英文（字母、数字、下划线，且不能以数字开头）。

## API 说明

插件使用禅道 REST API 获取用例信息：

- **获取 Token**：`POST /max/api.php/v1/tokens`
- **获取用例**：`GET /max/api.php/v1/testcases/{id}`

**超时时间**：5 秒

## 常见问题

### 连接失败

- 检查网络是否通畅
- 确认禅道服务器地址正确（不需要 `http://` 前缀）
- 验证用户名和密码

### 获取用例失败

- 确认用例 ID 存在
- 检查账号是否有访问权限
- 查看控制台错误信息

### 步骤没有显示

- 确认禅道用例中已填写测试步骤
- 检查 API 返回的数据格式
