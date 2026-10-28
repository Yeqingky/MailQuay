# Changelog

## 未发布

### 变更

- 顶栏搜索改为点击后在顶栏内展开整行搜索输入, 替换写邮件和右侧操作, 不再弹出浮层; 提交导航到 `/search`, `Escape` 关闭.
- 前端引入 Motion: 通知堆叠改为 layout 和 presence 动画, 设置与写邮件浮层使用 spring 入场和退出动画, 阅读器切换淡入, 任务进度条改为 spring 过渡; 统一遵循 `prefers-reduced-motion`.
- 运行日志改为 SSE 推送: 新增 `GET /logs/stream`, 按 `<generation>-<entryId>` 游标增量发送日志批次, 重连用 `Last-Event-ID` 或 `after` 补发, 缓冲区清空或游标被覆盖时先发 `reset` 事件再重放保留窗口.
- `GET /logs` 返回值增加 `cursor`, 作为日志流的起始游标.
- 任务中心日志标签不再每 1.5 秒轮询, 改为打开时取一次快照并保持日志流; 连续失败 3 次后显示重连提示.
- `/api/v1/logs/stream` 与 `/api/v1/logs` 一样不记录请求日志.
- 批量同步不再逐封推送 `message.new`: 首次同步, UIDVALIDITY 重置或一次新增超过 50 封时改为每秒最多一条 `mailbox.updated` 进度事件, 同步结束, 失败或取消时补发最终事件.
- `message.new` 附带列表行所需的轻量摘要 (不含正文和附件), IDLE 与增量新邮件可直接插入列表.
- 前端不再按事件逐封请求 `GET /messages/{id}`: 缺摘要时合并为一次列表刷新, SSE 引发的缓存失效按 1-1.5 秒窗口合并, 页面重新可见时校准计数和任务.

### 修复

- 首次同步等批量拉取期间, 浏览器按邮件数量发起详情请求导致请求风暴和连接失败.

## v0.1.1 - 2026-10-28

### 变更

- Compose 容器名固定: 两套文件都使用 `mailquay` (应用) 和 `mailquay-sql` (数据库); 连接串改用容器名.
- 生产镜像标签改用 `MAILQUAY_IMAGE_TAG`, 避免与开发栈的 `MAILQUAY_VERSION` 混用.
- 开发栈参数从 `.env` 读取, compose 用 `${VAR:-默认值}` 提供回退: `POSTGRES_USER`, `POSTGRES_PASSWORD` 和 `POSTGRES_DB` 默认都是 `mailquay`, 端口默认只绑定 `127.0.0.1:8080`, 只有 `MAILQUAY_SECRET_KEY` 必填; 连接串在 compose 内拼接.
- PostgreSQL 密码开发默认值由 `mailquay-dev` 改为 `mailquay`; 已有开发数据库需执行 `ALTER USER mailquay WITH PASSWORD 'mailquay'`.
- `MAILQUAY_DATABASE_URL` 不再写入 `.env`, 由 compose 用容器名和 `POSTGRES_*`, `MAILQUAY_DB_NAME` 拼接; `scripts/new-database.sh` 仍通过改写 `MAILQUAY_DB_NAME` 切换库.

### 修复

- 容器内运行用户由自动分配的 `100:101` 固定为 `101:101`, 与数据目录属主一致; 已有数据目录升级前执行 `chown -R 101:101 ./data`.

## v0.1.0 - 2026-10-28

首个正式版本. 数据库 schema 以 `00001_init.sql` 为基线, 不包含预发布阶段的兼容迁移.

### 新增

- 单用户自托管 Web 邮件客户端, 多邮箱账号, 跨账号统一收件箱, 未读, 已发送, 草稿, 已删除, 已标记和本地归档视图.
- IMAP 初次与增量同步, IDLE 实时收信和周期轮询; POP3 兼容模式提供单个虚拟收件箱, UIDL 跟踪和本地标志.
- SMTP 发信, 回复, 转发, 草稿, 附件, 定时发送和可重试发件队列; 每账号可配置默认发信名称和 Reply-To.
- 本地标记与本地归档保存完整正文和附件, 不受远端删除或账号删除影响.
- Bleve 内嵌全文搜索, 支持 CJK 分析器, 组合筛选和 IMAP 服务端搜索回退.
- SSE 实时事件, 任务中心, 运行日志查看和同步错误提示.
- 居中浮层设置, 账号引导添加, 服务器自动发现, eM Client 导入和 OAuth2/XOAUTH2 授权.
- 凭据加密存储, HTML 邮件 allowlist 清洗与 sandbox iframe, 远程图片默认阻止, CSRF, 登录限流, CSP 和 HSTS.
- 两种构建形态: `mailquay` 内嵌前端, `mailquay-core` 仅 API; 多平台二进制, 多架构镜像和生产 Compose 栈.

### 变更

- 数据库迁移合并为单一 `00001_init.sql` 基线, 移除 v0.1.0 之前的增量迁移和数据回填脚本.
- `MAILQUAY_SETUP_TOKEN` 长度校验移到配置加载阶段, 设置后始终要求至少 16 字符.
- README 的状态, 功能列表和技术说明按首个正式版本更新.
