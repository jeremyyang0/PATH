# PATH (Plugin Auto Test Homie) - VSCode 插件

> **P**lugin **A**uto **T**est **H**omie 

## 🚀 插件概述

**PATH** 是一个专为 VSCode 设计的Python自动化测试助手插件，智能解析和显示 Python 代码中的 Ele 类变量和测试方法，以树形结构展示，提供强大的自动化测试代码生成功能。插件支持中文显示、智能搜索、拖拽操作、状态保持等现代化功能。

## ✨ 核心特性

### 🌳 智能树形结构
- **测试元素树**：自动解析Python代码中的Ele类变量
- **测试方法树**：展示项目中的所有测试方法
- **双视图设计**：元素与方法并行显示，提升开发效率
- **状态保持**：切换插件后自动保持展开状态和搜索关键词

### 🔍 高级搜索功能
- **双语搜索**：支持中文描述和英文变量名搜索
- **实时过滤**：输入即搜索，实时显示匹配结果
- **智能匹配**：保持层级结构完整性
- **搜索记忆**：切换回插件时自动恢复搜索状态

### 🌏 中文本地化支持
- **智能映射**：自动读取`__init__.py`文件中的中文名称
- **双语显示**：界面显示中文，代码使用英文路径
- **多属性支持**：支持多种中文名称提取方式
- **编码兼容**：完美支持UTF-8中文编码

### 🎯 智能拖拽系统
- **所见即所得**：界面显示中文名称，便于理解
- **精确路径**：拖拽生成准确的英文变量路径
- **智能识别**：只允许拖拽有效的测试元素
- **层级处理**：基于实际代码结构而非UI层级

### ⚡ 自动代码生成
- **右键操作**：便捷的右键菜单"添加操作"功能
- **操作类型**：支持点击和双击操作自动生成
- **智能文件管理**：自动创建和组织测试文件
- **类结构生成**：智能生成类结构和继承关系
- **自动跳转**：生成后自动打开文件并定位到新方法

### 🔄 实时同步更新
- **文件监听**：自动监听Python文件变化
- **即时刷新**：文件修改后自动更新树结构
- **状态恢复**：刷新后保持之前的展开和搜索状态
- **插件切换**：切换回插件时自动刷新数据

## 📦 安装指南

### 方法一：从VSIX文件安装（推荐）
1. 下载 `path-plugin-auto-test-homie-0.1.0.vsix` 文件
2. 在 VSCode 中打开命令面板 (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. 输入 "Extensions: Install from VSIX"
4. 选择下载的 `.vsix` 文件
5. 重启 VSCode

### 方法二：开发者安装
```bash
# 克隆项目
git clone <repository-url>
cd path-plugin-auto-test-homie

# 安装依赖
npm install

# 编译项目
npm run compile

# 在VSCode中按F5启动调试
```

## 🎮 使用指南

### 基本操作
1. **启动插件**：打开包含Python代码的工作区
2. **查看树结构**：在活动栏找到 "PATH - 测试元素树" 图标
3. **浏览元素**：展开/收起节点，查看测试元素
4. **搜索元素**：使用搜索框快速定位目标元素
5. **生成代码**：右键元素选择操作类型，自动生成测试代码

### 高级功能
- **🔍 搜索技巧**：输入关键词实时搜索，支持中英文混合
- **📋 拖拽使用**：直接拖拽元素到编辑器生成代码路径
- **🎯 精确跳转**：双击元素或方法自动跳转到源码位置
- **⚙️ 批量操作**：使用工具栏的展开/收起全部功能

## 🌟 功能演示

### 界面布局
```
PATH测试元素树                    PATH测试方法树
├── 📁 原理图模块                  ├── 📁 test_logic
│   └── 📁 编辑器                  │   ├── 🔧 test_add_component
│       └── 📁 对话框              │   └── 🔧 test_delete_component
│           ├── 🎯 添加按钮        └── 📁 test_schematic
│           └── 🎯 删除按钮            └── 🔧 test_save_file
└── 📁 元件库模块
    └── 🎯 搜索框
```

### 拖拽代码生成
**拖拽前（界面显示）**：
```
原理图模块 → 编辑器 → 对话框 → 添加按钮
```

**拖拽后（生成代码）**：
```python
schematic.editor.dialog.add_button
```

### 自动测试代码生成
**右键选择"点击"操作后自动生成**：
```python
def test_click_add_button(self):
    """测试点击添加按钮"""
    self.add_button.click()
    # TODO: 添加断言验证
```

## 🛠️ 支持的代码格式

### Ele变量定义
```python
class ComponentDialog:
    """组件对话框"""
    add_button = Ele(attr=names.add_btn, desc='添加组件按钮')
    delete_button = Ele(attr=names.del_btn, desc='删除组件按钮')
    search_input = Ele(attr=names.search_box, desc='搜索输入框')
```

### 中文包名定义
```python
# __init__.py
class SchematicEditor:
    name = "原理图编辑器"
    chinese_name = "电路图编辑器"
    description = "用于编辑电路原理图"
```

### 测试方法定义
```python
class TestSchematic:
    def test_add_component(self):
        """测试添加元件"""
        pass
    
    def test_save_file(self):
        """测试保存文件"""
        pass
```

## ⌨️ 快捷操作

| 功能 | 快捷键/操作 | 描述 |
|------|-------------|------|
| 🔄 刷新数据 | 点击刷新按钮 | 重新加载所有数据 |
| 🔍 快速搜索 | 在搜索框输入 | 实时搜索匹配元素 |
| 🗑️ 清除搜索 | 点击清除按钮 | 恢复完整树结构 |
| 📂 展开全部 | 点击展开按钮 | 展开所有节点 |
| 📁 收起全部 | 点击收起按钮 | 收起所有节点 |
| 🎯 拖拽代码 | 拖拽元素到编辑器 | 生成变量路径 |
| ⚡ 生成测试 | 右键选择操作 | 自动生成测试代码 |
| 🔗 跳转源码 | 双击元素/方法 | 跳转到定义位置 |

## 📋 命令列表

| 命令ID | 功能 | 说明 |
|--------|------|------|
| `eleTreeViewer.refresh` | 刷新元素树 | 重新解析Python文件 |
| `methodsViewer.refresh` | 刷新方法树 | 重新扫描测试方法 |
| `eleTreeViewer.search` | 搜索元素 | 打开搜索功能 |
| `eleTreeViewer.expandAll` | 展开全部 | 展开所有节点 |
| `eleTreeViewer.collapseAll` | 收起全部 | 收起所有节点 |
| `eleTreeViewer.dragToEditor` | 拖拽到编辑器 | 插入元素路径 |
| `eleTreeViewer.addClickOperation` | 添加点击操作 | 生成点击测试代码 |
| `eleTreeViewer.addDoubleClickOperation` | 添加双击操作 | 生成双击测试代码 |
| `methodsViewer.jumpToMethod` | 跳转到方法 | 定位方法源码 |

## 🔧 故障排除

### 常见问题

**Q: 插件没有显示任何内容？**
A: 
- ✅ 确保工作区包含Python文件
- ✅ 检查是否存在Ele类变量定义
- ✅ 尝试点击刷新按钮重新加载

**Q: 中文名称没有显示？**
A:
- ✅ 检查`__init__.py`文件是否存在
- ✅ 确认文件编码为UTF-8
- ✅ 验证类中包含中文属性（name, chinese_name等）

**Q: 搜索功能无效？**
A:
- ✅ 确认输入的关键词正确
- ✅ 尝试使用不同的搜索词
- ✅ 检查是否有匹配的元素存在

**Q: 拖拽生成的路径不正确？**
A:
- ✅ 确认变量名拼写正确
- ✅ 检查包结构是否完整
- ✅ 验证文件路径层级关系

**Q: 切换插件后状态丢失？**
A:
- ✅ 新版本已支持状态保持
- ✅ 如仍有问题，尝试重新激活插件
- ✅ 检查VSCode版本是否支持

## 📊 技术规格

### 环境要求
- **VSCode版本**：1.60.0+
- **Python版本**：3.6+
- **Node.js版本**：14.x+
- **操作系统**：Windows/macOS/Linux

### 性能指标
- **启动时间**：< 2秒
- **文件解析**：支持100+文件同时解析
- **搜索响应**：实时搜索，< 100ms延迟
- **内存占用**：< 50MB

## 🏗️ 开发信息

### 技术栈
- **前端**：TypeScript + VSCode Extension API
- **解析器**：Python AST解析
- **构建工具**：TypeScript Compiler + ESLint
- **状态管理**：VSCode WebView State API

### 项目结构
```
path-plugin-auto-test-homie/
├── src/                          # TypeScript源码
│   ├── extension.ts              # 主扩展入口
│   ├── eleTreeWebviewProvider.ts # 元素树视图提供者
│   ├── methodsTreeWebviewProvider.ts # 方法树视图提供者
│   ├── eleTreeDataProvider.ts    # 元素数据提供者
│   ├── methodsDataProvider.ts    # 方法数据提供者
│   ├── commands.ts               # 命令处理
│   └── utils.ts                  # 工具函数
├── resources/                    # 静态资源
│   ├── eleTreeViewer.html        # 元素树HTML
│   ├── eleTreeViewer.js          # 元素树脚本
│   ├── methodsTreeViewer.html    # 方法树HTML
│   └── methodsTreeViewer.js      # 方法树脚本
├── out/                          # 编译输出
├── parse_ele.py                  # Python解析脚本
├── package.json                  # 插件配置
└── tsconfig.json                 # TypeScript配置
```

### 开发命令
```bash
# 安装依赖
npm install

# 开发模式编译
npm run watch

# 生产构建
npm run compile

# 代码检查
npm run lint

# 运行测试
npm run test
```

## 📈 版本历史

### v0.1.0 (PATH重命名版本)
- 🎉 **重大更新**：插件重命名为PATH (Plugin Auto Test Homie)
- 🎨 **界面优化**：更新所有UI文本和图标描述
- 📚 **文档完善**：全新的README和使用指南
- 🏷️ **分类更新**：添加"Testing"分类标签

### v0.0.9 (状态保持版本)
- 💾 **状态保持**：切换插件后自动保持展开状态和搜索关键词
- 🔄 **自动刷新**：切换回插件时自动刷新数据
- ⚡ **性能优化**：优化webview加载和状态恢复机制

### v0.0.8 (方法树版本)
- 🚀 **重大升级**：新增方法树，直接选择方法拖拽和点击
- ⚡ **右键菜单优化**：简化调用链，提升操作效率

### v0.0.7 (模块化版本)
- 🚀 **架构重构**：模块化extension.ts，提升代码维护性
- 🎯 **操作优化**：减少添加操作的二级菜单

### v0.0.1-v0.0.6
- 基础功能实现和逐步优化

## 👥 贡献指南

### 参与开发
1. Fork 项目仓库
2. 创建功能分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'Add amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 提交Pull Request

### 代码规范
- 遵循TypeScript最佳实践
- 使用ESLint进行代码检查
- 编写清晰的注释和文档
- 保持向后兼容性

## 📄 许可证

内部使用，请勿外传。