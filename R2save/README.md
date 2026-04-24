# R2save · Cloudflare R2 文件管理工具

一个自托管的 Cloudflare R2 网页管理端：浏览 / 上传 / 下载 / 删除对象，支持多存储桶、文件夹、预览、ZIP 流式下载、逐文件批量直下等。

源码同步自：<https://github.com/jinm8554-lgtm/R2save>（main 分支最新 HEAD）

---

## 技术栈

- 前端：Vite + React 19 + TypeScript + TailwindCSS + Radix UI
- 后端：Express + tRPC + Drizzle ORM（MySQL，可选）
- 对象存储：`@aws-sdk/client-s3`（R2 S3 兼容）
- 测试：Vitest

## 目录结构

```
R2save/
├── client/        # 前端
│   └── src/
│       ├── pages/Settings.tsx        # R2 凭证配置（含一键粘贴解析）
│       ├── pages/FileBrowser.tsx     # 文件浏览 + 批量下载入口
│       ├── hooks/useDownload.ts      # 单文件 / ZIP 流式 / 批量直下
│       └── lib/credentialsParser.ts  # 整段凭证文本解析器
├── server/        # 后端
├── shared/        # 前后端共享类型
└── drizzle/       # 数据库 schema（可选）
```

## 快速启动

```bash
# 安装依赖
pnpm install

# 开发模式（Vite + tsx watch）
pnpm dev

# 生产构建 & 启动
pnpm build
pnpm start

# 类型检查 & 单元测试
pnpm check
pnpm test
```

默认端口 `3000`，访问 <http://localhost:3000/settings> 即可填入 R2 凭证。

## 已实现亮点

### 1. 一键粘贴整段账号信息

在 **设置 / Settings** 页顶部，支持把 Cloudflare 控制台或笔记中整段账号信息（Endpoint、Access Key ID、Secret Access Key、Account ID、API Token 混排）直接贴进文本框，点 **"解析并填入"** 就自动分字段填好。

- 支持中文 / 英文 Label、任意字段顺序、Label 与值同行或换行
- 支持 **"从剪贴板读取并解析"**、**"复制当前配置"**、**"复制（脱敏）"**
- 纯前端实现，解析器位于 `client/src/lib/credentialsParser.ts`，覆盖 7 个单元测试

### 2. 两种批量下载模式

在文件列表勾选后，右上角 **下载 ▾** 下拉菜单提供：

| 模式 | 行为 |
|---|---|
| 流式下载（ZIP 打包） | 服务端流式代理，合并为一个 `.zip`；点击先弹 "另存为" |
| 批量直下（逐文件） | 先弹 "选择目录"（Chrome / Edge），递归展开后保留原相对路径直接落盘 |

"批量直下" 基于 File System Access API（`showDirectoryPicker`），浏览器不支持时自动回退到默认下载目录。

### 3. 其它

- 服务端流式代理 `/api/r2-proxy/*`，避免开放 R2 公共访问
- 凭证仅在进程内环境变量中保存，不进前端代码或网络响应
- 文件夹支持勾选、整桶下载

## 环境变量

| 变量 | 说明 |
|---|---|
| `R2_ENDPOINT` | R2 S3 终端节点 URL（必填之一） |
| `R2_ACCOUNT_ID` | Cloudflare 账户 ID（与 ENDPOINT 二选一） |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 API 令牌 |
| `R2_CF_API_TOKEN` | Cloudflare API Token，用于列桶（可选） |
| `DATABASE_URL` | MySQL 连接串（可选） |
| `OAUTH_SERVER_URL` | OAuth 服务地址（可选） |

> 也可以什么环境变量都不配，直接启动后在 `/settings` 页面用 "一键粘贴" 填入凭证。

## License

MIT
