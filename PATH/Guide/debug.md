# 调试支持

PATH 插件提供自动化的调试配置管理和右键快速调试功能。

## 功能概述

- 自动添加 MarkRunner 调试配置到 `launch.json`
- 支持右键快速启动调试
- 支持自定义调试配置

## 自动配置

### 触发时机

插件启动时，会自动检查并添加以下调试配置到 `.vscode/launch.json`：

### MarkRunner CLI

全局运行配置，用于调试运行整个项目的测试：

```json
{
    "name": "MarkRunner CLI",
    "type": "debugpy",
    "request": "launch",
    "module": "markrunner.cli",
    "args": ["run", "-p", "${workspaceFolder}"],
    "console": "integratedTerminal"
}
```

### MarkRunner Context Debug

上下文调试配置，用于调试当前文件：

```json
{
    "name": "MarkRunner Context Debug",
    "type": "debugpy",
    "request": "launch",
    "module": "markrunner.cli",
    "args": ["run", "-w", "${workspaceFolder}", "-p", "${relativeFile}", "--no-report", "--reruns", "0"],
    "console": "integratedTerminal"
}
```

### 配置添加规则

- 如果 `.vscode` 目录不存在，自动创建
- 如果 `launch.json` 不存在，自动创建并添加配置
- 如果 `launch.json` 已存在，检查是否已有同名配置：
  - 已存在：跳过添加
  - 不存在：追加到 `configurations` 数组

**注意**：插件会保留 `launch.json` 中的注释，不会破坏现有配置。

## 右键调试

### 使用条件

- 文件名以 `test_` 开头
- 文件扩展名为 `.py`

### 操作步骤

1. 打开测试文件（如 `test_login_001.py`）
2. 在编辑器中右键
3. 选择 **Debug Markrunner**
4. 自动启动调试会话

### 调试流程

1. 插件获取当前文件路径
2. 查找配置的 Launch Config
3. 使用该配置启动调试
4. VSCode 切换到调试视图

## 自定义配置

### 配置项

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| path.markrunner.contextLaunchConfigName | 右键调试使用的配置名称 | `MarkRunner Context Debug` |

### 自定义调试配置

如果需要自定义调试参数：

1. 在 `.vscode/launch.json` 中创建自定义配置：

```json
{
    "name": "My Custom Debug",
    "type": "debugpy",
    "request": "launch",
    "module": "markrunner.cli",
    "args": ["run", "-w", "${workspaceFolder}", "-p", "${relativeFile}", "--verbose"],
    "console": "integratedTerminal"
}
```

2. 在 VSCode 设置中指定配置名称：

```json
{
    "path.markrunner.contextLaunchConfigName": "My Custom Debug"
}
```

3. 右键调试时会使用自定义配置

### 查找规则

右键调试时，插件会：

1. 读取 `path.markrunner.contextLaunchConfigName` 配置
2. 在 `launch.json` 中查找同名配置
3. 找到：使用该配置（会覆盖部分动态参数）
4. 未找到：使用默认的 `MarkRunner Context Debug` 配置

## 调试技巧

### 设置断点

1. 在代码行号左侧点击，添加断点
2. 启动调试
3. 程序会在断点处暂停

### 调试面板

调试时可以使用 VSCode 调试面板：

- **变量**：查看当前作用域的变量值
- **监视**：添加表达式，实时查看值
- **调用堆栈**：查看函数调用链
- **断点**：管理所有断点

### 单步执行

| 快捷键 | 操作 |
|--------|------|
| F10 | 单步跳过（不进入函数） |
| F11 | 单步进入（进入函数） |
| Shift+F11 | 单步跳出（跳出当前函数） |
| F5 | 继续执行 |

## 常见问题

### 右键菜单没有 Debug Markrunner

- 检查文件名是否以 `test_` 开头
- 确认文件扩展名为 `.py`

### 调试启动失败

- 确认已安装 `debugpy` 扩展
- 检查 `markrunner` 模块是否已安装
- 查看调试控制台的错误信息

### 配置没有自动添加

- 检查 `.vscode` 目录权限
- 查看 VSCode 输出面板的错误信息
- 手动添加配置
