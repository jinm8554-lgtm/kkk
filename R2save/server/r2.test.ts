/**
 * R2 Router 单元测试
 * 测试凭证状态检查、存储桶列表、文件列表等核心逻辑
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock S3Client
vi.mock("@aws-sdk/client-s3", () => {
  const mockSend = vi.fn();
  return {
    S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
    ListObjectsV2Command: vi.fn(),
    PutObjectCommand: vi.fn(),
    DeleteObjectsCommand: vi.fn(),
    GetObjectCommand: vi.fn(),
    HeadObjectCommand: vi.fn(),
    _mockSend: mockSend,
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://presigned.example.com/test"),
}));

function createCtx(user?: TrpcContext["user"]): TrpcContext {
  return {
    user: user ?? null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("r2.status", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env.R2_ACCOUNT_ID = originalEnv.R2_ACCOUNT_ID;
    process.env.R2_ACCESS_KEY_ID = originalEnv.R2_ACCESS_KEY_ID;
    process.env.R2_SECRET_ACCESS_KEY = originalEnv.R2_SECRET_ACCESS_KEY;
    process.env.R2_CF_API_TOKEN = originalEnv.R2_CF_API_TOKEN;
    process.env.R2_ENDPOINT = originalEnv.R2_ENDPOINT;
  });

  it("当凭证未配置时返回 configured: false", async () => {
    process.env.R2_ACCESS_KEY_ID = "";
    process.env.R2_SECRET_ACCESS_KEY = "";
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.r2.status();
    expect(result.configured).toBe(false);
  });

  it("当凭证已配置时返回 configured: true", async () => {
    process.env.R2_ACCESS_KEY_ID = "test-access-key";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.R2_ENDPOINT = "https://test.r2.cloudflarestorage.com";
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.r2.status();
    expect(result.configured).toBe(true);
  });

  it("当 CF API Token 已配置时返回 hasCfToken: true", async () => {
    process.env.R2_CF_API_TOKEN = "cfat_test_token";
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.r2.status();
    expect(result.hasCfToken).toBe(true);
  });

  it("当 CF API Token 未配置时返回 hasCfToken: false", async () => {
    process.env.R2_CF_API_TOKEN = "";
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.r2.status();
    expect(result.hasCfToken).toBe(false);
  });
});

describe("r2.listBuckets", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env.R2_ACCOUNT_ID = originalEnv.R2_ACCOUNT_ID;
    process.env.R2_CF_API_TOKEN = originalEnv.R2_CF_API_TOKEN;
    vi.restoreAllMocks();
  });

  it("当 CF API Token 未配置时返回空列表和错误信息", async () => {
    process.env.R2_ACCOUNT_ID = "";
    process.env.R2_CF_API_TOKEN = "";
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.r2.listBuckets();
    expect(result.buckets).toHaveLength(0);
    expect(result.error).toBeTruthy();
  });

  it("当 Cloudflare API 返回成功时解析存储桶列表", async () => {
    process.env.R2_ACCOUNT_ID = "test-account-id";
    process.env.R2_CF_API_TOKEN = "test-cf-token";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          buckets: [
            { name: "test-bucket-1", creation_date: "2024-01-01T00:00:00Z" },
            { name: "test-bucket-2", creation_date: "2024-02-01T00:00:00Z" },
          ],
        },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.r2.listBuckets();
    expect(result.buckets).toHaveLength(2);
    expect(result.buckets[0].name).toBe("test-bucket-1");
    expect(result.error).toBeNull();
  });
});

describe("r2.listObjects - 公开接口", () => {
  it("listObjects 是公开接口，未登录用户也可调用（凭证未配置时返回 INTERNAL_SERVER_ERROR）", async () => {
    // listObjects 使用 publicProcedure，未登录可访问
    // 但凭证未配置时会抛出 INTERNAL_SERVER_ERROR
    process.env.R2_ACCESS_KEY_ID = "";
    process.env.R2_SECRET_ACCESS_KEY = "";
    process.env.R2_ENDPOINT = "";
    process.env.R2_ACCOUNT_ID = "";
    const caller = appRouter.createCaller(createCtx(null));
    await expect(
      caller.r2.listObjects({ bucket: "test", prefix: "", recursive: false })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

describe("r2.deleteObjects - 需要认证", () => {
  it("未登录用户调用 deleteObjects 应抛出 UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(createCtx(null));
    await expect(
      caller.r2.deleteObjects({ bucket: "test", keys: ["test.txt"] })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("r2.getUploadUrl - 需要认证", () => {
  it("未登录用户调用 getUploadUrl 应抛出 UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(createCtx(null));
    await expect(
      caller.r2.getUploadUrl({ bucket: "test", key: "test.txt", contentType: "text/plain" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
