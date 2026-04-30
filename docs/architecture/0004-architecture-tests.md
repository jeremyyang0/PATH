# 架构测试

Demo 阶段最常见的问题不是“没有重构”，而是“刚重构出边界，第二天又被打穿”。

所以需要最低成本的架构测试：

1. `domain/` 禁止 import `vscode`
2. `domain/` 禁止 import `presentation/` 与 `infrastructure/`
3. `application/` 禁止 import `presentation/`
4. 禁止跨模块深层 import：
   - 允许 `modules/foo` -> `modules/bar/index`
   - 禁止 `modules/foo` -> `modules/bar/infrastructure/...`
5. 命令 ID 和视图 ID 必须唯一
