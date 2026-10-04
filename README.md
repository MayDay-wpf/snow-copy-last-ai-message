# snow-copy-last-ai-message

Snow App 客户端脚本：在侧边栏会话的「⋯」/ 右键菜单中新增「复制最后一条 AI 消息」，
一键把当前打开会话的最后一条 AI 回复复制到剪贴板。

- 市场条目 id：`snow.copy-last-ai-message`
- 类型：客户端脚本（`@snow-target client`），运行于 Snow App 桌面窗口
- 视图 / 区域：`chat` / `sidebar`
- 依赖：`GM_setClipboard`

## 安装

推荐：Snow App 打开「插件 → 插件市场」，搜索「复制最后一条 AI 消息」并安装。

手动：在 Snow App「插件 → 插件列表 → 脚本插件 → 导入文件」选择 `copy-last-ai-message.user.js`，
导入后在列表中启用。

## 使用

打开任意会话，在侧边栏会话条目上打开「⋯」菜单或右键菜单，点击「复制最后一条AI消息」；
当前打开会话的最后一条 AI 回复会写入剪贴板，窗口底部出现提示条。

说明：脚本运行在沙箱隔离世界，只能读取已渲染的消息 DOM，因此以「当前打开的会话」为准；
消息列表虚拟化滚动时脚本会先临时滚到底读取、随后还原滚动位置。

## 开发

源码即 `copy-last-ai-message.user.js`，元数据头遵循 Snow App 客户端脚本契约
（`@snow-target` / `@snow-view` / `@snow-surface`，DOM 锚点 `data-snow-anchor` 与插槽 `data-snow-slot`）。
修改后在「插件 → 插件列表 → 脚本插件」内编辑或重新导入生效。

## 发布

推送 `v*` 形式的 tag（如 `v1.0.0`）即自动触发 GitHub Actions（`.github/workflows/release.yml`）：
创建 Release 并把 `copy-last-ai-message.user.js` 作为资产上传。

之后在 [snow-plugin-store](https://github.com/MayDay-wpf/snow-plugin-store) 的 `app/registry.json`
更新条目（`version` / `tag` / `sha256`，哈希为资产文件的 SHA-256）并推送，即可在 Snow App 插件市场更新。

## 许可

MIT
