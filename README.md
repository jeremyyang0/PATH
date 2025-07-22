# Ele Tree Viewer - VSCode 插件

## 功能概述

Ele Tree Viewer 是一个专为 VSCode 设计的插件，用于解析和显示 Python 代码中的 Ele 类变量，并以树形结构展示。插件支持中文显示、智能搜索、拖拽操作等功能。

## 主要特性

### 1. 🌳 树形结构显示
- 自动解析 Python 代码中的 Ele 类变量
- 按文件路径层级组织显示
- 支持展开/收起操作
- 显示变量的行号和值信息

### 2. 🔍 智能搜索功能
- 支持中文描述和变量名搜索
- 实时过滤显示结果
- 保持层级结构完整性
- 一键清除搜索结果

### 3. 🈳 中文包名映射
- 自动读取 `__init__.py` 文件中的中文名称
- 将英文文件夹名替换为中文显示
- 支持多种中文名称提取方式
- 保持代码路径的准确性

### 4. 🎯 智能拖拽功能
- 双路径系统：显示中文，拖拽英文
- 支持拖拽到编辑器任意位置
- 自动生成准确的变量路径
- 支持层级变量关系
- 只允许拖拽Ele变量节点（叶子节点）

### 5. ⚡ 自动代码生成
- 右键菜单"添加操作"功能
- 支持点击和双击操作生成
- 自动创建原子方法文件
- 智能生成类结构和继承关系
- 自动打开文件并跳转到新方法

## 安装和使用

### 安装步骤
1. 下载 `ele-tree-viewer-0.0.1.vsix` 文件
2. 在 VSCode 中打开命令面板 (`Ctrl+Shift+P`)
3. 输入 "Extensions: Install from VSIX"
4. 选择下载的 `.vsix` 文件
5. 重启 VSCode

### 使用方法
1. 打开包含 Python 代码的工作区
2. 在侧边栏找到 "Ele变量树" 图标
3. 点击刷新按钮加载数据
4. 浏览、搜索、拖拽变量

## 功能详解

### 搜索功能
- 点击搜索图标 🔍 或使用命令面板
- 输入关键词（支持中文描述或变量名）
- 自动过滤并高亮匹配项
- 点击清除图标 🗑️ 恢复完整视图

### 中文显示
- 自动扫描 `method` 目录下的包结构
- 从 `__init__.py` 文件提取中文名称
- 支持的属性：`name`, `display_name`, `title`, `chinese_name`, `desc`, `description`
- 优先级：类名 > 属性值 > 文档字符串

### 拖拽操作
- **界面显示**：中文名称，便于理解
- **拖拽结果**：英文变量路径，便于使用
- **操作方式**：直接拖拽或右键菜单
- **路径格式**：`包路径.变量名`
- **层级处理**：基于实际代码结构，不受UI层级影响

## 示例演示

### 界面显示
```
原理图
  └── 原理图编辑器
      └── 对话框
          └── 添加库
              ├── 添加部件按钮
              │   ├── 更多按钮
              │   └── 更多按钮2
              └── 删除部件按钮
```

### 拖拽结果
```
logic.logic_editor.dialog.add_part.add_part_button
logic.logic_editor.dialog.add_part.add_more_button1
logic.logic_editor.dialog.add_part.delete_part_button
```

## 支持的代码格式

### Ele 变量定义
```python
class SomeEle:
    button1 = Ele(attr=names.button1_ele, decs='按钮1')
    button2 = Ele(attr=names.button2_ele, decs='父按钮 -> 子按钮')
```

### 包名定义
```python
# __init__.py
class LogicEditor:
    name = "逻辑编辑器"
    description = "用于编辑逻辑流程"
```

## 快捷键和命令

| 功能 | 命令 | 描述 |
|------|------|------|
| 刷新 | `eleTreeViewer.refresh` | 重新加载数据 |
| 搜索 | `eleTreeViewer.search` | 打开搜索框 |
| 清除搜索 | `eleTreeViewer.clearSearch` | 清除搜索结果 |
| 展开全部 | `eleTreeViewer.expandAll` | 展开所有节点 |
| 收起全部 | `eleTreeViewer.collapseAll` | 收起所有节点 |
| 拖拽到编辑器 | `eleTreeViewer.dragToEditor` | 插入变量路径 |
| 添加操作 | `eleTreeViewer.addOperation` | 为Ele元素添加操作方法 |

## 故障排除

### 插件不显示
1. 确保工作区已打开
2. 检查是否包含 Python 文件
3. 验证 Ele 类变量格式是否正确

### 中文名称未显示
1. 检查 `__init__.py` 文件是否存在
2. 确认文件编码为 UTF-8
3. 验证类中是否包含中文属性

### 搜索无结果
1. 确认关键词是否正确
2. 检查是否有匹配的 Ele 变量
3. 尝试使用不同的关键词

### 拖拽路径错误
1. 检查变量名是否正确
2. 确认包结构是否完整
3. 验证文件路径是否正确

## 技术要求

- VSCode 版本：1.60.0 或更高
- Node.js 和 npm：用于TypeScript编译和依赖管理
- Python 环境：用于解析脚本运行
- 工作区：包含 Python 代码的项目

## 开发环境

本插件使用 TypeScript 开发：

### 编译和构建
```bash
# 安装依赖
npm install

# 编译TypeScript
npm run compile

# 监视模式编译
npm run watch

# 代码检查
npm run lint
```

### 项目结构
```
src/
  └── extension.ts    # 主要扩展逻辑（TypeScript）
out/
  └── extension.js    # 编译后的JavaScript文件
parse_ele.py         # Python解析脚本
tsconfig.json        # TypeScript配置
package.json         # 扩展配置和依赖
```

## 更新日志

### v0.0.3 (功能增强版本)
- 🔧 **Bug修复**：修复展开全部树功能不生效的问题
- 🎯 **拖拽优化**：限制只能拖拽Ele变量节点（叶子节点）
- ⚡ **新增功能**：右键菜单"添加操作"，支持点击和双击操作
- 🤖 **智能生成**：自动生成原子方法文件和类结构
- 📁 **文件管理**：智能创建和管理Python文件
- 🔗 **自动跳转**：生成方法后自动打开文件并跳转

### v0.0.2 (TypeScript版本)
- 🚀 **重大升级**：完全迁移到 TypeScript
- ✨ 增强的类型安全和开发体验
- 🛠️ 改进的构建系统和开发工具链
- 📚 更新的开发文档和项目结构
- 🔧 添加 ESLint 和 TypeScript 配置
- 🎯 保持完全向后兼容

### v0.0.1
- 基础树形结构显示
- 智能搜索功能
- 中文包名映射
- 智能拖拽功能
- 层级关系修复：正确处理UI层级与代码结构的区别
- 完整的用户文档

## 开发者信息

本插件专为特定的 Python 项目结构设计，支持 Ele 类变量的解析和显示。

### 技术特点
- **前端**: TypeScript + VSCode Extension API
- **后端**: Python 解析脚本
- **构建**: TypeScript 编译器 + npm scripts
- **代码质量**: ESLint + TypeScript 严格模式

### 开发贡献
如需参与开发或报告问题：
1. 确保安装 Node.js 和 Python 环境
2. 运行 `npm install` 安装依赖
3. 使用 `npm run watch` 进行开发调试
4. 遵循 TypeScript 和 ESLint 规范

如有问题或建议，请查看相关文档或联系开发者。

## 许可证

本项目仅供内部使用，请勿分发。 