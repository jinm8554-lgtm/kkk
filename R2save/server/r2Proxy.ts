/**
 * R2 文件代理路由
 * 通过服务端从 R2 拉取文件并流式返回，无需开启 R2 公开访问
 * 路由格式：GET /api/r2-proxy/:bucket/*key
 */
import type { Express, Request, Response } from "express";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "stream";

function getR2Client(): S3Client | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return null;
  const endpoint =
    process.env.R2_ENDPOINT ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null);
  if (!endpoint) return null;
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });
}

export function registerR2Proxy(app: Express): void {
  // 匹配 /api/r2-proxy/:bucket/*（key 可能含斜杠）
  app.get("/api/r2-proxy/:bucket/*", async (req: Request, res: Response) => {
    const client = getR2Client();
    if (!client) {
      res.status(503).json({ error: "R2 未配置，请先在设置页面填写凭证" });
      return;
    }

    const bucket = req.params.bucket;
    const key = (req.params as Record<string, string>)["0"] ?? "";

    if (!bucket || !key) {
      res.status(400).json({ error: "缺少 bucket 或 key 参数" });
      return;
    }

    try {
      const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
      const result = await client.send(cmd);

      const contentType = result.ContentType ?? "application/octet-stream";
      res.setHeader("Content-Type", contentType);

      if (result.ContentLength) {
        res.setHeader("Content-Length", result.ContentLength);
      }

      // 图片/文本内联显示，其他文件触发下载
      const filename = key.split("/").pop() ?? key;
      const inlineTypes = ["image/", "text/", "application/pdf", "video/", "audio/"];
      const isInline = inlineTypes.some((t) => contentType.startsWith(t));
      if (isInline) {
        res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(filename)}"`);
      } else {
        res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
      }

      // 缓存 1 小时
      res.setHeader("Cache-Control", "private, max-age=3600");

      // 流式传输
      const stream = result.Body as Readable;
      stream.pipe(res);
      stream.on("error", (err) => {
        console.error("[R2 Proxy] Stream error:", err);
        if (!res.headersSent) res.status(500).json({ error: "流传输错误" });
      });
    } catch (err: unknown) {
      const code = (err as { Code?: string; name?: string })?.Code ?? (err as { name?: string })?.name;
      if (code === "NoSuchKey" || code === "NotFound") {
        res.status(404).json({ error: "文件不存在" });
      } else if (code === "NoSuchBucket") {
        res.status(404).json({ error: "存储桶不存在" });
      } else {
        console.error("[R2 Proxy] Error:", err);
        res.status(500).json({ error: "代理请求失败" });
      }
    }
  });
}
