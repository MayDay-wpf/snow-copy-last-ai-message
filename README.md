# snow-copy-last-ai-message

Snow App 客户端脚本：在侧边栏会话的「⋯」/ 右键菜单中新增「复制最后一条 AI 消息」，
一键把该会话的最后一条 AI 回复复制到剪贴板。

- 市场条目 id：`snow.copy-last-ai-message`
- 类型：客户端脚本（`@snow-target client`），运行于 Snow App 桌面窗口
- 视图 / 区域：`chat` / `sidebar`
- 依赖：`GM_setClipboard`、`messages` 元数据域（`@snow-privacy messages`）、会话菜单的 `data-snow-conversation-id` 钩子

## 安装

推荐：Snow App 打开「插件 → 插件市场」，搜索「复制最后一条 AI 消息」并安装。

手动：在 Snow App「插件 → 插件列表 → 脚本插件 → 导入文件」选择 `copy-last-ai-message.user.js`，
导入后在列表中启用。

## 使用

在侧边栏任意会话条目上打开「⋯」菜单或右键菜单，点击「复制最后一条AI消息」；
该会话（不要求是当前打开的会话）的最后一条 AI 回复会写入剪贴板，窗口底部出现提示条。

脚本按会话 id 通过宿主的 `messages` 元数据域读取消息，不读取消息列表 DOM、不滚动界面，
正在输出中的会话也可以随时复制。

说明：脚本依赖 Snow App 在会话菜单根节点提供的 `data-snow-conversation-id` 钩子；
应用版本缺少该钩子时，菜单里不会出现本项。

## 开发

源码即 `copy-last-ai-message.user.js`，元数据头遵循 Snow App 客户端脚本契约
（`@snow-target` / `@snow-view` / `@snow-surface` / `@snow-privacy`；DOM 侧依赖会话菜单根节点的
`role="menu"` 与 `data-snow-conversation-id`，见内置文档《油猴脚本》的「稳定契约」章节）。
修改后在「插件 → 插件列表 → 脚本插件」内编辑或重新导入生效。

## 发布

推送 `v*` 形式的 tag（如 `v1.1.0`）即自动触发 GitHub Actions（`.github/workflows/release.yml`）：
创建 Release 并把 `copy-last-ai-message.user.js` 作为资产上传。

之后在 [snow-plugin-store](https://github.com/MayDay-wpf/snow-plugin-store) 的 `app/registry.json`
更新条目（`version` / `tag` / `sha256`，哈希为资产文件的 SHA-256）并推送，即可在 Snow App 插件市场更新。

## 许可

MIT
