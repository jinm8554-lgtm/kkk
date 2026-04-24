import { describe, expect, it } from "vitest";
import { formatR2Credentials, parseR2Credentials } from "./credentialsParser";

describe("parseR2Credentials", () => {
  it("解析用户示例的完整凭证块（Label 与值分行）", () => {
    // 注意：测试固定使用明显假值，避免泄露真实凭证 / 被密钥扫描拦截
    const raw = `S3 终端节点 Endpoint:
https://exampleaccountid00000000000000.r2.cloudflarestorage.com
访问密钥 ID:
EXAMPLEACCESSKEYID00000000000000
机密访问密钥:
EXAMPLESECRETKEY_DO_NOT_USE_0000000000000000000000000000000000000000
Account ID:
exampleaccountid00000000000000
Cloudflare API Token:
cfat_EXAMPLE_TOKEN_DO_NOT_USE_000000000000000000000000`;

    const { values, matchedCount } = parseR2Credentials(raw);
    expect(matchedCount).toBe(5);
    expect(values.R2_ENDPOINT).toBe(
      "https://exampleaccountid00000000000000.r2.cloudflarestorage.com",
    );
    expect(values.R2_ACCESS_KEY_ID).toBe("EXAMPLEACCESSKEYID00000000000000");
    expect(values.R2_SECRET_ACCESS_KEY).toBe(
      "EXAMPLESECRETKEY_DO_NOT_USE_0000000000000000000000000000000000000000",
    );
    expect(values.R2_ACCOUNT_ID).toBe("exampleaccountid00000000000000");
    expect(values.R2_CF_API_TOKEN).toBe(
      "cfat_EXAMPLE_TOKEN_DO_NOT_USE_000000000000000000000000",
    );
  });

  it("支持 Label 与值同一行、使用英文或中文冒号", () => {
    const raw = `Endpoint: https://abc.r2.cloudflarestorage.com
Access Key ID：AKID1234567890
Secret Access Key : SK_0987654321
Account ID: abc
API Token: cfat_TEST`;
    const { values } = parseR2Credentials(raw);
    expect(values.R2_ENDPOINT).toBe("https://abc.r2.cloudflarestorage.com");
    expect(values.R2_ACCESS_KEY_ID).toBe("AKID1234567890");
    expect(values.R2_SECRET_ACCESS_KEY).toBe("SK_0987654321");
    expect(values.R2_ACCOUNT_ID).toBe("abc");
    expect(values.R2_CF_API_TOKEN).toBe("cfat_TEST");
  });

  it("字段顺序任意、包含多余空行也不影响解析", () => {
    const raw = `

访问密钥 ID:
KEYID

机密访问密钥:
SECRETKEY

S3 终端节点 Endpoint:
https://xyz.r2.cloudflarestorage.com
`;
    const { values, matchedCount } = parseR2Credentials(raw);
    expect(matchedCount).toBeGreaterThanOrEqual(3);
    expect(values.R2_ACCESS_KEY_ID).toBe("KEYID");
    expect(values.R2_SECRET_ACCESS_KEY).toBe("SECRETKEY");
    expect(values.R2_ENDPOINT).toBe("https://xyz.r2.cloudflarestorage.com");
  });

  it("无 Label 时回退到特征匹配：URL、cfat_ Token、Endpoint 中推断 Account ID", () => {
    const raw = `随手复制的笔记
https://aabbccddeeff00112233445566778899.r2.cloudflarestorage.com
顺带给你一个 token cfat_ABCDEFG12345`;
    const { values } = parseR2Credentials(raw);
    expect(values.R2_ENDPOINT).toBe(
      "https://aabbccddeeff00112233445566778899.r2.cloudflarestorage.com",
    );
    expect(values.R2_CF_API_TOKEN).toBe("cfat_ABCDEFG12345");
    expect(values.R2_ACCOUNT_ID).toBe("aabbccddeeff00112233445566778899");
  });

  it("空文本返回空值", () => {
    const { values, matchedCount } = parseR2Credentials("   \n  ");
    expect(matchedCount).toBe(0);
    expect(values).toEqual({});
  });
});

describe("formatR2Credentials", () => {
  it("以标准格式输出整段文本", () => {
    const text = formatR2Credentials({
      R2_ENDPOINT: "https://x.r2.cloudflarestorage.com",
      R2_ACCESS_KEY_ID: "AK",
      R2_SECRET_ACCESS_KEY: "SK",
      R2_ACCOUNT_ID: "AID",
      R2_CF_API_TOKEN: "cfat_TOK",
    });
    expect(text).toContain("S3 终端节点 Endpoint:");
    expect(text).toContain("https://x.r2.cloudflarestorage.com");
    expect(text).toContain("cfat_TOK");
  });

  it("maskSecrets 会隐藏 AK/SK/Token 中间段", () => {
    const text = formatR2Credentials(
      {
        R2_ENDPOINT: "https://x.r2.cloudflarestorage.com",
        R2_ACCESS_KEY_ID: "ABCDEFGHIJ",
        R2_SECRET_ACCESS_KEY: "1234567890abcdef",
        R2_ACCOUNT_ID: "AID",
        R2_CF_API_TOKEN: "cfat_123456789",
      },
      { maskSecrets: true },
    );
    expect(text).toContain("ABC***HIJ");
    expect(text).not.toContain("1234567890abcdef");
  });
});
