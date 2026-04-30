# Zentao 模块拆分原则

当前最危险的问题不是“是否能调用禅道”，而是“禅道接入把 UI、凭证、HTTP、业务对象、视图状态全部绑死在一个 service 中”。

## 必须拆成五层

```text
modules/zentao/
  domain/               # Bug / Task / Story / Case 等领域对象
  application/ports/    # 对外部世界的依赖接口
  application/use-cases/
  infrastructure/       # HTTP / secrets / config 的实现
  presentation/         # TreeView / Webview / Controller
```

## 迁移顺序

1. 先把领域对象和端口抽出来。
2. 现有 `zentaoService.ts` 降级为 `LegacyZentaoGatewayAdapter`。
3. Provider/Webview 不再直接碰凭证和网络。
4. 视图层只消费 `use-case` 输出的 ViewModel。
