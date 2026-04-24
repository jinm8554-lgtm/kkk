/**
 * Cloudflare R2 Storage Router
 * 提供存储桶列表、文件列表、上传、删除、预签名下载等接口
 * 使用 @aws-sdk/client-s3（R2 兼容 S3 API）
 */
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

// ─── R2 客户端工厂 ─────────────────────────────────────────────────────────────
function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("R2 配置缺失，请先在设置页面配置 R2 凭证");
  }
  // 优先使用显式配置的 R2_ENDPOINT，否则根据 Account ID 自动拼接
  const endpoint =
    process.env.R2_ENDPOINT ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  if (!endpoint) {
    throw new Error("R2 Endpoint 未配置，请提供 R2_ENDPOINT 或 R2_ACCOUNT_ID");
  }
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });
}

// ─── tRPC 路由 ────────────────────────────────────────────────────────────────
export const r2Router = router({
  /**
   * 检查 R2 配置状态
   */
  status: publicProcedure.query(() => {
    const configured =
      Boolean(process.env.R2_ACCOUNT_ID) &&
      Boolean(process.env.R2_ACCESS_KEY_ID) &&
      Boolean(process.env.R2_SECRET_ACCESS_KEY);
    const hasCfToken = Boolean(process.env.R2_CF_API_TOKEN);
    return { configured, hasCfToken };
  }),

  /**
   * 列出账号下所有 R2 存储桶（通过 Cloudflare REST API）
   */
  listBuckets: publicProcedure.query(async () => {
    const accountId = process.env.R2_ACCOUNT_ID;
    const cfApiToken = process.env.R2_CF_API_TOKEN;
    if (!accountId || !cfApiToken) {
      return { buckets: [], error: "R2_ACCOUNT_ID 或 R2_CF_API_TOKEN 未配置" };
    }
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`,
        {
          headers: {
            Authorization: `Bearer ${cfApiToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (!res.ok) {
        const text = await res.text();
        return { buckets: [], error: `Cloudflare API 错误: ${res.status} ${text}` };
      }
      const data = (await res.json()) as {
        success: boolean;
        result: { buckets: Array<{ name: string; creation_date: string }> };
      };
      if (!data.success) {
        return { buckets: [], error: "Cloudflare API 返回失败" };
      }
      const buckets = (data.result?.buckets ?? []).map((b) => ({
        name: b.name,
        creationDate: b.creation_date,
      }));
      return { buckets, error: null };
    } catch (err) {
      return { buckets: [], error: String(err) };
    }
  }),

  /**
   * 列出指定存储桶中指定前缀下的文件和虚拟目录（分页，支持递归）
   */
  listObjects: publicProcedure
    .input(
      z.object({
        bucket: z.string().min(1),
        prefix: z.string().default(""),
        recursive: z.boolean().default(false),
        continuationToken: z.string().optional(),
        maxKeys: z.number().default(1000),
      })
    )
    .query(async ({ input }) => {
      const client = getR2Client();
      const prefix = input.prefix
        ? input.prefix.replace(/^\/+/, "").replace(/([^/])$/, "$1/").replace(/^\//, "")
        : "";
      // 空前缀时不加斜杠
      const normalizedPrefix = input.prefix === "" ? "" : prefix;

      const files: Array<{
        key: string;
        name: string;
        size: number;
        lastModified: string;
        etag: string;
        contentType: string;
        isFolder: false;
      }> = [];
      const folders: Array<{ key: string; name: string; isFolder: true }> = [];

      let continuationToken: string | undefined = input.continuationToken;
      let isTruncated = false;
      let nextContinuationToken: string | undefined;

      do {
        const cmd = new ListObjectsV2Command({
          Bucket: input.bucket,
          Prefix: normalizedPrefix || undefined,
          Delimiter: input.recursive ? undefined : "/",
          MaxKeys: input.maxKeys,
          ContinuationToken: continuationToken,
        });

        const resp = await client.send(cmd);
        isTruncated = resp.IsTruncated ?? false;
        nextContinuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;

        // 虚拟目录
        for (const cp of resp.CommonPrefixes ?? []) {
          if (!cp.Prefix) continue;
          const folderKey = cp.Prefix;
          const parts = folderKey.replace(/\/$/, "").split("/");
          const name = parts[parts.length - 1] ?? folderKey;
          folders.push({ key: folderKey, name, isFolder: true });
        }

        // 文件
        for (const obj of resp.Contents ?? []) {
          if (!obj.Key) continue;
          // 跳过前缀本身（虚拟目录占位符）
          if (obj.Key === normalizedPrefix) continue;
          const parts = obj.Key.split("/");
          const name = parts[parts.length - 1] ?? obj.Key;
          files.push({
            key: obj.Key,
            name,
            size: obj.Size ?? 0,
            lastModified: obj.LastModified?.toISOString() ?? "",
            etag: (obj.ETag ?? "").replace(/"/g, ""),
            contentType: "",
            isFolder: false,
          });
        }

        continuationToken = nextContinuationToken;
      } while (input.recursive && isTruncated);

      // 非递归模式只取第一页
      return {
        files,
        folders,
        isTruncated,
        nextContinuationToken,
        prefix: normalizedPrefix,
      };
    }),

  /**
   * 获取预签名上传 URL（大文件直传 R2，绕过服务器）
   */
  getUploadUrl: protectedProcedure
    .input(
      z.object({
        bucket: z.string().min(1),
        key: z.string().min(1),
        contentType: z.string().default("application/octet-stream"),
      })
    )
    .mutation(async ({ input }) => {
      const client = getR2Client();
      const cmd = new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        ContentType: input.contentType,
      });
      // 预签名 URL 有效期 15 分钟
      const presignedUrl = await getSignedUrl(client, cmd, { expiresIn: 900 });
      return { presignedUrl, key: input.key };
    }),

  /**
   * 服务端代理上传（接收 base64，适合小文件 < 10MB）
   */
  uploadFile: protectedProcedure
    .input(
      z.object({
        bucket: z.string().min(1),
        key: z.string().min(1),
        content: z.string().min(1), // base64 编码
        contentType: z.string().default("application/octet-stream"),
      })
    )
    .mutation(async ({ input }) => {
      const client = getR2Client();
      const buffer = Buffer.from(input.content, "base64");
      await client.send(
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
          Body: buffer,
          ContentType: input.contentType,
          ContentLength: buffer.byteLength,
        })
      );
      return { success: true, key: input.key };
    }),

  /**
   * 批量删除文件
   */
  deleteObjects: protectedProcedure
    .input(
      z.object({
        bucket: z.string().min(1),
        keys: z.array(z.string().min(1)).min(1).max(1000),
      })
    )
    .mutation(async ({ input }) => {
      const client = getR2Client();
      const result = await client.send(
        new DeleteObjectsCommand({
          Bucket: input.bucket,
          Delete: {
            Objects: input.keys.map((key) => ({ Key: key })),
            Quiet: false,
          },
        })
      );
      const deleted = result.Deleted?.map((d) => d.Key ?? "") ?? [];
      const errors = result.Errors?.map((e) => ({ key: e.Key ?? "", message: e.Message ?? "" })) ?? [];
      return { deleted, errors };
    }),

  /**
   * 获取预签名下载 URL
   */
  getDownloadUrl: publicProcedure
    .input(
      z.object({
        bucket: z.string().min(1),
        key: z.string().min(1),
        expiresIn: z.number().default(3600),
      })
    )
    .query(async ({ input }) => {
      const client = getR2Client();
      const cmd = new GetObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
      });
      const url = await getSignedUrl(client, cmd, { expiresIn: input.expiresIn });
      return { url };
    }),

  /**
   * 获取文件元信息（用于预览）
   */
  headObject: publicProcedure
    .input(
      z.object({
        bucket: z.string().min(1),
        key: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      const client = getR2Client();
      const result = await client.send(
        new HeadObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
        })
      );
      return {
        contentType: result.ContentType ?? "application/octet-stream",
        contentLength: result.ContentLength ?? 0,
        lastModified: result.LastModified?.toISOString() ?? "",
        etag: (result.ETag ?? "").replace(/"/g, ""),
      };
    }),
});
