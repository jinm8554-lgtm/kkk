/**
 * R2 凭证管理路由
 * 接收前端提交的凭证，写入运行时环境变量（进程内生效）
 * 注意：生产环境需通过 webdev_request_secrets 工具持久化到环境变量
 */
import type { Express, Request, Response } from "express";

export function registerCredentialsRoute(app: Express): void {
  app.post("/api/r2-credentials", (req: Request, res: Response) => {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_CF_API_TOKEN, R2_ENDPOINT } = req.body as Record<string, string>;

    if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      res.status(400).json({ error: "缺少必填字段：R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY" });
      return;
    }
    if (!R2_ENDPOINT && !R2_ACCOUNT_ID) {
      res.status(400).json({ error: "请提供 R2_ENDPOINT（终端节点地址）或 R2_ACCOUNT_ID" });
      return;
    }

    // 写入进程环境变量（当前进程内立即生效）
    if (R2_ACCOUNT_ID) process.env.R2_ACCOUNT_ID = R2_ACCOUNT_ID.trim();
    process.env.R2_ACCESS_KEY_ID = R2_ACCESS_KEY_ID.trim();
    process.env.R2_SECRET_ACCESS_KEY = R2_SECRET_ACCESS_KEY.trim();
    if (R2_ENDPOINT) {
      process.env.R2_ENDPOINT = R2_ENDPOINT.trim();
    }
    if (R2_CF_API_TOKEN) {
      process.env.R2_CF_API_TOKEN = R2_CF_API_TOKEN.trim();
    }

    console.log("[Credentials] R2 credentials updated in process env");
    res.json({ success: true, message: "凭证已更新（当前会话生效）" });
  });
}
