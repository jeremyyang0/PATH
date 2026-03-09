# 2.1.0

## New

- 新增 `PATH Sniff` 功能区，提供主控件树视图、`Sniff Overview` 和 `Sniff Logs` 三个联动视图。
- `PATH Sniff` 支持切换 `server_name`、刷新控件树、通过 `widget_def JSON` 搜索控件、定位并高亮目标控件。
- `Sniff Overview` 支持展示控件属性和生成的 `widget_def`，并展示 `match_count` 与 `occurrence` 等定位信息。
- 为 `PATH Sniff` 三个视图和 `PATH 文件树` 增加独立 SVG 图标，整体视觉风格与元素树、方法树保持一致。
- 元素树和方法树 Webview 增加前端 ready/debug 状态展示，便于排查扩展启动和数据加载问题。
- `PATH Sniff` 主视图调整了交互布局：`server_name` 与应用按钮同排显示，刷新/查找入口收敛到控件树标题区，查找改为弹窗输入 JSON 后执行。
- 将插件整体重构为 `features + shared` 模块化架构，拆分元素树、方法树、文件树、Sniff、AI、Workbench、禅道等功能的注册、Provider 与 Service。


# 2.0.0

## New

- 新增 `PATH 文件树`，支持按目录下的 `.order` 文件对同级文件和文件夹排序。
- `PATH 文件树` 支持新建文件、新建文件夹、重命名、删除、复制路径、复制相对路径、在文件夹中搜索、Create Case。
- `PATH 文件树` 支持常用快捷键：`A` 新建文件、`Shift+A` 新建文件夹、`F2` 重命名、`Delete` 删除。
- `.order`、`.py`、文件创建、删除、重命名后会自动刷新相关视图。
- `PATH 文件树` 遵守 `files.exclude`。
- `PATH 文件树` 文件图标继续继承当前 VS Code 文件图标主题。
- `.order` 文件固定排在同级最前。
- 未被 `.order` 命中的同级项，默认按以下规则排序：`_` 前缀优先，其次文件夹，其次 `.` 开头文件，最后普通文件。
- 方法树支持 `.order` 排序。
- 元素树支持 `.order` 排序。
- 元素树/方法树空目录时显示空文件夹图标。
- 方法树和元素树的视图图标已区分，方法树使用独立的 `methods-tree.svg`。
