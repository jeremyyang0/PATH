# Ele Tree Viewer - TypeScript 版本构建说明

## 环境要求

在开始之前，请确保您的系统已安装：

- **Node.js** (版本 14.x 或更高)
- **npm** (通常随 Node.js 一起安装)
- **Python** (用于运行解析脚本)
- **VSCode** (版本 1.60.0 或更高)

## 快速开始

### 1. 安装依赖

在项目根目录运行：

```bash
npm install
```

### 2. 编译项目

```bash
# 一次性编译
npm run compile

# 或者使用监视模式（推荐用于开发）
npm run watch
```

### 3. 打包扩展

```bash
# 安装 vsce 工具（如果还没有）
npm install -g vsce

# 打包扩展
vsce package
```

这将生成一个 `.vsix` 文件，可以安装到 VSCode 中。

### 4. 安装扩展

在 VSCode 中：
1. 打开命令面板 (`Ctrl+Shift+P`)
2. 输入 "Extensions: Install from VSIX"
3. 选择生成的 `.vsix` 文件

## 开发流程

### 开发模式

1. 在 VSCode 中打开项目
2. 运行 `npm run watch` 启动监视模式
3. 按 `F5` 启动扩展开发主机
4. 在新窗口中测试扩展功能

### 代码检查

```bash
npm run lint
```

### 项目结构

```
├── src/
│   └── extension.ts        # 主要扩展逻辑 (TypeScript)
├── out/                    # 编译输出目录
│   └── extension.js        # 编译后的 JavaScript
├── parse_ele.py           # Python 解析脚本
├── package.json           # 扩展配置和依赖
├── tsconfig.json          # TypeScript 配置
├── .eslintrc.json         # ESLint 配置
└── README.md              # 用户文档
```

## 常见问题

### Q: 编译失败，提示找不到模块
A: 确保运行了 `npm install` 安装所有依赖。

### Q: Python 脚本无法运行
A: 确保 Python 环境正确配置，并且系统 PATH 中包含 Python。

### Q: 扩展无法加载
A: 检查编译是否成功，确认 `out/extension.js` 文件存在。

### Q: TypeScript 类型错误
A: 
1. 确保安装了 `@types/vscode` 依赖
2. 检查 TypeScript 版本是否兼容
3. 运行 `npm run compile` 查看详细错误信息

## 调试

### 在 VSCode 中调试

1. 在 `src/extension.ts` 中设置断点
2. 按 `F5` 启动调试会话
3. 在扩展开发主机中触发相关功能

### 查看日志

- 扩展日志：VSCode 开发者工具控制台
- Python 脚本输出：终端或 VSCode 输出面板

## 贡献指南

1. 遵循现有的代码风格
2. 确保 TypeScript 类型安全
3. 运行 `npm run lint` 检查代码质量
4. 编写清晰的提交信息

## TypeScript 迁移说明

本项目已从 JavaScript 完全迁移到 TypeScript，主要改进包括：

- ✅ 完整的类型安全
- ✅ 更好的 IDE 支持
- ✅ 编译时错误检查
- ✅ 现代化的开发工具链
- ✅ 改进的代码组织和文档

原有的功能保持不变，但现在具有更好的可维护性和开发体验。 