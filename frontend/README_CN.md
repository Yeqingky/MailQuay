# MailQuay 前端

简体中文 | [English](README.md)

[MailQuay](https://github.com/Yeqingky/MailQuay) 的 React 单页前端. MailQuay 是一个面向已有 IMAP, POP3, SMTP 邮箱的自托管 Web 邮件客户端.

前端本身不保存业务状态. 它只访问 MailQuay HTTP API, 渲染三栏邮件界面, 并通过 Server-Sent Events 接收实时更新. 前端不连接 IMAP, POP3 或 SMTP, 也不接触邮箱凭据.

添加账号时可以选择 IMAP 或 POP3, 三种协议的主机, 端口和传输安全都可自定义; 默认端口只是提示, 不是约束.

应用从单个 `index.html` 启动, 使用 `react-router` 导航, 切换页面不重新加载文档. 静态托管需要把未命中的路径重写到 `index.html`. 账号和文件夹页面使用路径参数, 但 URL 不指向具体邮件; 邮件选择只保存在页面状态, 打开链接不会触发正文或附件拉取. 搜索条件不写入 URL.

> **状态:** 已实现. 单页应用可由 Vite 构建, 并访问 MailQuay API.

## 技术栈

| 关注点 | 选择 |
| --- | --- |
| 运行时 | React 19, TypeScript (strict) |
| 构建 | Vite |
| 路由 | 单个 `index.html` 上的 `react-router` |
| 服务端状态 | TanStack Query v5 |
| UI 状态 | Zustand |
| 样式 | Tailwind CSS v4, CSS 变量, 明暗主题 |
| 组件 | shadcn/ui (Radix 原语), lucide-react 图标 |
| 列表 | TanStack Virtual |
| 编辑器 | TipTap |
| HTML 邮件 | DOMPurify 加 sandbox iframe |
| 国际化 | i18next, 英文与简体中文 |
| 测试 | Vitest, Testing Library, Playwright |

## 布局

应用壳使用固定左侧栏加内容区顶栏:

- 非 HTTPS 且不在 loopback 或私网范围时, 整个应用顶部显示不可关闭的红色安全提醒条; 额外域名和 CIDR 可通过部署配置放行.
- 内容区有独立顶栏. 左侧: 写邮件. 右侧: 搜索, 刷新, 任务环, 明暗切换, 登录用户头像. 任务中心保留顶栏, 隐藏写邮件和搜索.
- 头像是登录用户, 不是邮箱账号. 悬停或点击展开紧凑卡片, 显示资料, 设置和退出.
- 桌面端侧边栏宽度可拖动 (默认 `232px`, 最小 `180px`): 顶部直接列出全局视图, 下面是默认折叠的邮箱账号列表, 底部只显示 SSE 连接状态.
- 全局视图为全部收件, 未读, 已发送, 发送中, 草稿, 已删除, 已标记, 本地归档. 已标记为空时隐藏; 全局没有"其他".
- 设置只能从右上角账号菜单进入, 侧边栏没有设置入口.
- 每个邮箱账号默认折叠; 展开后显示收件箱, 未读, 已发送, 草稿, 已删除, 垃圾邮件, 最下面是自己的折叠"其他". Archive, 标签和自定义文件夹都在这里.
- 回复, 转发, 标记, 本地归档, 删除放在阅读器顶部, 不放在全局顶栏; 全部回复放在回复菜单里.
- 任务环直径 `36px`, 多段圆环. 每类任务使用一个颜色 token, 按工作量占比占用弧段, 段内按完成百分比填充; 无任务时整环为白色.
- 悬停或聚焦任务环时向下展开任务面板, 列出运行中和待运行任务, 显示账号, 百分比和计数; 颜色不是唯一信息.
- 设置以居中浮层弹窗打开, 覆盖在邮件主界面之上, 共用左侧导航, 搜索, 关闭按钮和 `Escape` 返回; 每个分组保留固定路径.
- 写邮件是应用内窗口, 发件人一行选择邮箱账号; Reply-To 是预填的可编辑字段.
- 操作反馈统一放在右下角通知条: 折叠时显示最新一条, 其余通知错位叠放; 悬浮展开最多 3 条, 通知之间留有 `4px` 间距, 最新的在最上面, 并带有弹出与消失动画; 表单内不再显示成功或错误文字.
- 已保存的主题在首屏渲染前应用, 暗色模式刷新不会先闪亮色.
- 小于 `md` 时侧边栏收进 `Sheet` 抽屉, 邮件列表与阅读器改为同一文档内的独立视图, 不再左右分栏.
- 侧边栏, 邮件列表和阅读器都可通过竖直分隔条调整宽度; 最小宽度分别为 `180px`, `320px`, `360px`. 宽度保存在本地 UI 状态.

```text
┌──────────────────┬─────────────────────────────────────────────────────┐
│ 全局视图          │ [写邮件]      [搜索] [刷新] [任务环] [主题] [头像]  │
├──────────────────┼───────────────────────┬─────────────────────────────┤
│                  │ 列表工具栏             │ 阅读工具栏 [回复] ...       │
│                  │ 邮件列表               │ 发件人 / 主题                │
│  全部收件    12   │ (虚拟滚动)             │ 正文                        │
│  未读          3  │                       │                             │
│  已发送           │                       │                             │
│  发送中        1  │                       │                             │
│  草稿          2  │                       │                             │
│  已删除           │                       │                             │
│  已标记        4  │                       │                             │
│  本地归档         │                       │                             │
│ ▸ account@ex...  │                       │                             │
│ ▸ me@example.com │                       │                             │
│ SSE 连接状态     │                       │                             │
└──────────────────┴───────────────────────┴─────────────────────────────┘
```

## 目录

```
src/
├── main.tsx          # 挂载 Provider 和路由
├── app/              # 路由表, 邮件壳, 设置壳, Provider, 错误边界
├── pages/            # 路由页面组件
├── features/         # auth, accounts, identities, mailboxes, message-list,
│                     # message-view, compose, search, tasks, settings
├── components/       # ui (shadcn), layout, common
├── lib/              # 生成的 API 客户端, SSE, 邮件 HTML 工具
├── hooks/
├── stores/           # 只放 UI 状态
├── locales/          # en, zh-CN
└── styles/           # Tailwind 入口与主题令牌
```

模块级说明见 [项目结构文档](https://github.com/Yeqingky/MailQuay/blob/main/docs/project-structure.md).

## 配置

API 地址按以下优先级解析:

1. 运行时 `window.__MAILQUAY_CONFIG__.apiBaseUrl`, 由容器环境变量 `MAILQUAY_API_BASE_URL` 在启动时生成.
2. 构建时 `VITE_API_BASE_URL`.
3. 同源 `/api/v1`.

推荐同源部署: 使用含前端版后端, 或在静态平台把 `/api/` 反向代理到后端, 不涉及 CORS 和跨站 Cookie.

## 开发

```sh
pnpm install
pnpm dev
```

Vite 开发服务器按固定路径提供 `/`, `/unread`, `/settings/preferences`, `/login`, `/setup`, `/compose` 等页面, 并把 `/api` 代理到 `http://127.0.0.1:8080`. 其他命令:

```sh
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm e2e
pnpm generate:api
```

## 部署

前端有两种部署方式, 不提供容器镜像.

1. **静态托管 (Cloudflare Pages 等)**
   - 执行 `pnpm build`, 把 `dist/` 上传到平台.
   - 构建时用 `VITE_API_BASE_URL` 指定 API, 或上传后修改 `config.js` 中的 `window.__MAILQUAY_CONFIG__.apiBaseUrl`.
   - 前后端跨源时, 在后端设置页的服务器分组添加前端来源, 并使用 HTTPS.

2. **由含前端版后端内嵌**
   - 把 `dist/` 复制到后端 `internal/webassets/dist`, 执行 `make build-full`; 发布工作流会自动拉取前端标签.
   - `mailquay` 镜像或二进制同时提供 `/api/v1` 和静态页面.

## 文档

- [架构](https://github.com/Yeqingky/MailQuay/blob/main/docs/architecture.md)
- [项目结构](https://github.com/Yeqingky/MailQuay/blob/main/docs/project-structure.md)
- [开发文档](https://github.com/Yeqingky/MailQuay/blob/main/docs/development.md)
- [仓库规则](https://github.com/Yeqingky/MailQuay/blob/main/AGENTS.md)

## 许可证

[MIT](LICENSE)
