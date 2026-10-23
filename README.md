# 本地账户头像 (@local/local-avatar)

[![DSH Market](https://raw.githubusercontent.com/2BingLing/dsh-market/master/assets/readme/badge-listed-zh.svg)](https://dsh.market/)

给 DeepSeek Harness Web UI 用的本地账户头像覆盖插件。

侧栏底部的账户头像和「设置 → 账号与余额」里的头像都跟随 DeepSeek 账户资料；
这个插件允许用一张本地图片覆盖这两个位置，只保存在这台电脑上，不修改
DeepSeek 账户资料，也不读取、不上传任何凭据。

## 安装

```bash
# 从 GitHub 安装（推荐）
dsh plugin add https://github.com/Yoimiya-Lover-0621-01/dsh-local-avatar

# 或从本地目录安装
dsh plugin add "D:\path\to\dsh-local-avatar"
```

或在 Harness 的「插件 → 添加插件」里选择本目录。安装后重启/刷新 Web UI，
即可在 **设置 → 通用设置** 看到「账户头像」一行。

## 使用

1. 打开 **设置 → 通用设置**。
2. 在「账户头像」一行点 **选择图片**，选一张本地图片。
3. 插件会自动居中裁剪为 256×256 并保存；侧栏和账号页的头像立即换成这张图。
4. 点 **恢复默认** 可还原 DeepSeek 账户头像。

## 实现

- 客户端插件注册两个位置：
  - `settings.general.item`（id `local-avatar`）：通用设置里的头像选择行；
  - `shell.overlay`（id `local-avatar-style`）：覆盖头像的样式表。
- 账户头像的包装元素带 `data-avatar-status`；样式把本地图片铺到该元素上并
  隐藏原来的 `<img>`，因此不触碰账户状态、资料数据和 Platform 请求。
- 图片保存在应用本地存储的 `dsh-local-avatar:v1` 键中。
  桌面端页面是 `file://` 源，选择在重启应用后仍然保留；
  如果改用浏览器打开 Web GUI（127.0.0.1 随机端口），本地存储按源隔离，
  换端口后需要重新选择一次。

## 注意

- 覆盖依赖 DSH 当前账户头像组件的结构（`data-avatar-status` 和组件类名哈希）。
  DSH 大版本更新后如果覆盖失效，按新组件的结构更新 `client.js` 里的选择器即可。
- 建议使用正方形图片；非正方形图片会按短边居中裁剪。
