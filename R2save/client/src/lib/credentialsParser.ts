/**
 * R2 凭证整段文本解析器
 *
 * 目标：允许用户直接从 Cloudflare 控制台或笔记中粘贴类似如下的整段文本，
 * 并一键抽取出对应字段，自动填入表单。
 *
 * 示例输入：
 *   S3 终端节点 Endpoint:
 *   https://xxxx.r2.cloudflarestorage.com
 *   访问密钥 ID:
 *   xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *   机密访问密钥:
 *   yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
 *   Account ID:
 *   xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *   Cloudflare API Token:
 *   cfat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *
 * 解析原则：
 *  - 字段顺序可任意
 *  - 同一字段可能有多种中英文 Label
 *  - 值可能与 Label 在同一行（由 `:` / `：` 分隔），也可能在下一行
 *  - 冒号、空格、大小写、换行类型（\r\n / \n）均不敏感
 */

export interface R2CredentialsFields {
  R2_ENDPOINT: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_ACCOUNT_ID: string;
  R2_CF_API_TOKEN: string;
}

export type R2CredentialField = keyof R2CredentialsFields;

/**
 * 每个字段对应的 Label 别名列表（不区分大小写）。
 * 顺序：长而唯一的 Label 放前面，便于精确匹配。
 */
const FIELD_LABELS: Record<R2CredentialField, string[]> = {
  R2_ENDPOINT: [
    "S3 终端节点 Endpoint",
    "S3 终端节点（Endpoint）",
    "S3 终端节点(Endpoint)",
    "S3 终端节点",
    "终端节点 Endpoint",
    "终端节点地址",
    "终端节点",
    "Endpoint URL",
    "Endpoint",
    "R2_ENDPOINT",
  ],
  R2_ACCESS_KEY_ID: [
    "访问密钥 ID",
    "访问密钥ID",
    "Access Key ID",
    "AccessKeyId",
    "AccessKey ID",
    "R2_ACCESS_KEY_ID",
  ],
  R2_SECRET_ACCESS_KEY: [
    "机密访问密钥",
    "秘密访问密钥",
    "私密访问密钥",
    "Secret Access Key",
    "SecretAccessKey",
    "R2_SECRET_ACCESS_KEY",
  ],
  R2_ACCOUNT_ID: [
    "Account ID",
    "AccountID",
    "账户 ID",
    "账户ID",
    "账号 ID",
    "账号ID",
    "R2_ACCOUNT_ID",
  ],
  R2_CF_API_TOKEN: [
    "Cloudflare API Token",
    "CF API Token",
    "API Token",
    "API 令牌",
    "R2_CF_API_TOKEN",
  ],
};

/** 转义正则特殊字符 */
function escapeRegExp(src: string): string {
  return src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 从整段文本中提取指定字段的值。
 * 策略：定位任意一个 Label，然后取紧跟其后的、非空、非 Label 的一行作为值。
 */
function extractField(text: string, field: R2CredentialField): string {
  const labels = FIELD_LABELS[field];
  const normalized = text.replace(/\r\n/g, "\n");

  // 把全部已知 Label 的集合做成一个排除匹配器，避免把下一段 Label 当成值
  const allLabels = Object.values(FIELD_LABELS).flat();
  const labelLineRegex = new RegExp(
    `^\\s*(?:${allLabels.map(escapeRegExp).join("|")})\\s*[:：]?\\s*$`,
    "i",
  );

  for (const label of labels) {
    // 匹配形如 `Label:value`、`Label：value` 或 `Label\nvalue` 的结构
    const pattern = new RegExp(
      `(?:^|\\n)\\s*${escapeRegExp(label)}\\s*[:：]?\\s*(.*)`,
      "i",
    );
    const m = normalized.match(pattern);
    if (!m) continue;

    // 先看同一行是否已经给出值
    const sameLine = (m[1] ?? "").trim();
    if (sameLine && !labelLineRegex.test(sameLine)) {
      return sameLine;
    }

    // 否则回退到 Label 之后的第一非空非 Label 行
    const afterIdx = (m.index ?? 0) + m[0].length;
    const rest = normalized.slice(afterIdx).split("\n");
    for (const line of rest) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (labelLineRegex.test(trimmed)) break; // 碰到下一个 Label 就停
      return trimmed;
    }
  }
  return "";
}

/**
 * 解析整段凭证文本。
 *
 * 返回解析出的字段与识别到的字段数，便于前端给出 toast 反馈。
 * 如果一个字段都没识别到，返回 matchedCount=0，由调用方决定是否报错。
 */
export function parseR2Credentials(raw: string): {
  values: Partial<R2CredentialsFields>;
  matchedCount: number;
} {
  const text = (raw ?? "").trim();
  if (!text) return { values: {}, matchedCount: 0 };

  const values: Partial<R2CredentialsFields> = {};
  const fieldOrder: R2CredentialField[] = [
    "R2_ENDPOINT",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_ACCOUNT_ID",
    "R2_CF_API_TOKEN",
  ];

  for (const field of fieldOrder) {
    const v = extractField(text, field);
    if (v) values[field] = v;
  }

  // 回退策略：当 Label 完全缺失但能通过特征识别时仍尝试补齐
  if (!values.R2_ENDPOINT) {
    const m = text.match(/https?:\/\/[^\s]+\.r2\.cloudflarestorage\.com[^\s]*/i);
    if (m) values.R2_ENDPOINT = m[0];
  }
  if (!values.R2_CF_API_TOKEN) {
    const m = text.match(/\bcfat_[A-Za-z0-9]+/);
    if (m) values.R2_CF_API_TOKEN = m[0];
  }
  if (!values.R2_ACCOUNT_ID && values.R2_ENDPOINT) {
    // 从 endpoint 自动拆出 Account ID（32 位十六进制子域）
    const m = values.R2_ENDPOINT.match(
      /https?:\/\/([a-f0-9]{32})\.r2\.cloudflarestorage\.com/i,
    );
    if (m) values.R2_ACCOUNT_ID = m[1];
  }

  return { values, matchedCount: Object.keys(values).length };
}

/**
 * 以用户熟悉的格式，把当前表单/已保存凭证序列化为整段文本，
 * 供一键复制使用。对空字段用占位符，便于填写后再整段复制回来。
 */
export function formatR2Credentials(
  values: Partial<R2CredentialsFields>,
  options: { maskSecrets?: boolean } = {},
): string {
  const mask = options.maskSecrets === true;
  const secretify = (v: string | undefined) => {
    if (!v) return "";
    if (!mask) return v;
    if (v.length <= 6) return "***";
    return `${v.slice(0, 3)}***${v.slice(-3)}`;
  };

  return [
    "S3 终端节点 Endpoint:",
    values.R2_ENDPOINT ?? "",
    "访问密钥 ID:",
    secretify(values.R2_ACCESS_KEY_ID),
    "机密访问密钥:",
    secretify(values.R2_SECRET_ACCESS_KEY),
    "Account ID:",
    values.R2_ACCOUNT_ID ?? "",
    "Cloudflare API Token:",
    secretify(values.R2_CF_API_TOKEN),
  ].join("\n");
}
