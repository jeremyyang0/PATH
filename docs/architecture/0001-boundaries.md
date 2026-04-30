# Needle 架构边界（Demo 阶段即可执行）

> 目标：允许破坏性调整，优先解决后续半年内最容易失控的耦合面。

## 1. 顶层目录只保留四层

```text
src/
  kernel/        # activate/deactivate、命令注册、视图注册、生命周期
  platform/      # vscode、fs、http、secrets、webview 等平台适配
  modules/       # 真正业务模块，按领域拆分
  shared/        # 无业务语义、无 vscode 强依赖的纯工具
```

## 2. 依赖方向

- `kernel -> modules`
- `modules/presentation -> modules/application -> modules/domain`
- `modules/infrastructure -> modules/application`
- `platform -> vscode | node | 第三方 SDK`
- `shared` 不能反向依赖 `modules`

## 3. 禁令

1. 禁止 feature 之间深层互相 import，例如：
   - `features/ele-tree/...` 直接 import `features/zentao/...`
2. 禁止把 `TreeItem` 作为全项目通用 DTO。
3. 禁止 `Provider` 同时承担：
   - UI 事件处理
   - 业务编排
   - IO/网络请求
   - 数据缓存
4. 禁止 `shared/` 演化为“任何放不下的都往这里塞”的技术垃圾桶。

## 4. 迁移约束

- 现有 `features/*` 逐步收敛到 `modules/*`
- 现有 `shared/indexing`、`shared/python` 中含业务语义的内容迁移到 `modules/code-index`
- 现有 `zentaoService.ts` 只允许保留为过渡适配器，最终拆为：
  - `domain/`
  - `application/ports`
  - `application/use-cases`
  - `infrastructure/`
  - `presentation/`

## 5. 命名约定

- 目录名使用完整业务名，避免缩写：
  - `ele-tree` -> `element-tree`
  - `path-file-tree` -> `workspace-tree` 或 `project-tree`
- class 名必须体现职责：
  - `Provider` 只做 VS Code Provider
  - `Controller` 只做消息/动作协调
  - `Gateway` 只做外部系统访问
  - `Store` 只做缓存/状态/凭证存储

## 6. 过渡策略

先加骨架和边界检查，再做模块搬迁。不要一开始就追求一次性改完；先让错误的依赖“长不出来”。
