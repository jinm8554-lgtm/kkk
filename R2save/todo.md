# R2 Manager TODO

## 基础配置
- [x] 安装 jszip 依赖
- [x] 配置深色主题 CSS 变量（index.css）
- [x] 配置 AppLayout 侧边栏导航（深色科技感）

## 服务端
- [x] R2 客户端工厂（从 ENV 读取凭证，优先使用 R2_ENDPOINT）
- [x] R2 代理下载路由 /api/r2-proxy/:bucket/*（流式代理）
- [x] 凭证配置路由 /api/r2-credentials（写入进程 ENV）
- [x] tRPC: r2.status - 检查凭证配置状态
- [x] tRPC: r2.listBuckets - 列出所有存储桶（Cloudflare API）
- [x] tRPC: r2.listObjects - 列出指定桶/前缀下的文件和虚拟目录
- [x] tRPC: r2.getUploadUrl - 获取预签名上传 URL（大文件直传）
- [x] tRPC: r2.uploadFile - 服务端代理上传（小文件 base64）
- [x] tRPC: r2.deleteObjects - 批量删除文件
- [x] tRPC: r2.getDownloadUrl - 获取预签名下载 URL
- [x] tRPC: r2.headObject - 获取文件元信息（用于预览）

## 前端页面
- [x] 凭证配置页面（Settings）- 支持 Endpoint、Access Key、Secret Key、CF API Token
- [x] 存储桶列表页面（Buckets）- 列出并切换存储桶
- [x] 文件浏览器页面（FileBrowser）- 目录导航、面包屑、表格/网格视图
- [x] 上传组件（UploadPanel）- 拖拽/点击上传，进度显示
- [x] 文件夹上传 - 递归遍历，保留目录结构，并发批量上传，总体进度
- [x] 单文件下载 - 通过代理流式下载
- [x] 批量下载 - 选中文件打包 ZIP 下载，进度显示
- [x] 文件夹下载 - 递归列出所有文件，打包 ZIP（保留目录结构）
- [x] 文件删除 - 单个/批量删除，二次确认弹窗
- [x] 文件预览（FilePreview）- 图片内联预览，视频/音频播放，其他类型显示图标
- [x] 搜索筛选 - 按文件名关键词搜索
- [x] 排序 - 按名称/大小/时间排序
- [x] R2Context - 全局状态管理（当前桶、凭证状态）
- [x] Dashboard 概览页面 - 显示存储桶数量、当前桶、快速入口
- [x] 文件图标组件（FileIcon）- 按文件类型显示对应图标

## 凭证支持
- [x] 支持 R2_ENDPOINT 自定义终端节点（从截图中的 Endpoint URL 直接粘贴）
- [x] 凭证通过服务端环境变量安全存储，不暴露前端

## 测试
- [x] R2 路由单元测试（10 个测试全部通过）
