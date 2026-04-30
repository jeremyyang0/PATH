# 代码索引模块拆分原则

`PythonIndexService` 这类名字通常意味着“扫描目录 + 读取文件 + 解析语法 + 构建树 + 维护缓存 + 暴露 UI 刷新”。

这类类名本身就暴露了设计失败：它不是一个 service，而是一团流程。

## 正确拆分

```text
modules/code-index/
  domain/                    # Symbol / FileIndex / CodeIndex
  application/ports/         # 文件扫描、文本读取、符号提取
  application/use-cases/     # rebuild / refresh / query
  infrastructure/fs/         # workspace 文件扫描、文件读取
  infrastructure/python/     # python 提取器
  presentation/              # 供 tree/webview 消费的 ViewModel
```

## 结果

- `ele-tree` / `methods-tree` / `path-file-tree` 以后都消费统一索引结果
- 语言提取器可插拔
- 单元测试可以直接打在 use-case 上，而不是靠 UI 冒烟测试兜底
