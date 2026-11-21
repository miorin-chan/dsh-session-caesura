# 开发与验证

[使用说明](../README.zh.md)记录安装和使用方式，[开发约定](../AGENTS.local.md)记录源码与构建产物的位置。

在插件目录执行 `npm ci`、`npm run build` 和 `npm run check`。
检查涵盖行为、类型、产物与运行版本。
在工作区根目录执行 `node tools/new-dsh-plugin/cli.mjs --check plugins/dsh-session-caesura` 校验插件骨架。
