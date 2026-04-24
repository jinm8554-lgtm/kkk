import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Settings2,
  Key,
  Shield,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  ExternalLink,
  Info,
  Link2,
  ClipboardPaste,
  Copy,
  Wand2,
  Eraser,
} from "lucide-react";
import {
  formatR2Credentials,
  parseR2Credentials,
  type R2CredentialField,
} from "@/lib/credentialsParser";

/** 人类可读的字段名，用于 toast 提示 */
const FIELD_LABEL_CN: Record<R2CredentialField, string> = {
  R2_ENDPOINT: "S3 终端节点",
  R2_ACCESS_KEY_ID: "访问密钥 ID",
  R2_SECRET_ACCESS_KEY: "机密访问密钥",
  R2_ACCOUNT_ID: "Account ID",
  R2_CF_API_TOKEN: "Cloudflare API Token",
};

export default function Settings() {
  const { data: status, refetch: refetchStatus } = trpc.r2.status.useQuery();

  const [showSecrets, setShowSecrets] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [form, setForm] = useState({
    R2_ACCOUNT_ID: "",
    R2_ACCESS_KEY_ID: "",
    R2_SECRET_ACCESS_KEY: "",
    R2_ENDPOINT: "",
    R2_CF_API_TOKEN: "",
  });

  const handleSave = async () => {
    if (!form.R2_ACCESS_KEY_ID || !form.R2_SECRET_ACCESS_KEY) {
      toast.error("请填写 Access Key ID 和 Secret Access Key");
      return;
    }
    if (!form.R2_ENDPOINT && !form.R2_ACCOUNT_ID) {
      toast.error("请填写 S3 终端节点地址（Endpoint）或 Account ID");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/r2-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "保存失败" }));
        throw new Error((err as { error: string }).error ?? "保存失败");
      }
      toast.success("凭证已保存，正在验证连接...");
      setTimeout(() => { refetchStatus(); }, 500);
      setForm({ R2_ACCOUNT_ID: "", R2_ACCESS_KEY_ID: "", R2_SECRET_ACCESS_KEY: "", R2_ENDPOINT: "", R2_CF_API_TOKEN: "" });
      setBulkText("");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  /** 使用当前文本框内容解析并填入表单 */
  const handleParseBulk = (rawInput?: string) => {
    const raw = rawInput ?? bulkText;
    if (!raw.trim()) {
      toast.error("请先粘贴账号信息");
      return;
    }
    const { values, matchedCount } = parseR2Credentials(raw);
    if (matchedCount === 0) {
      toast.error("未能识别任何字段，请检查文本格式");
      return;
    }
    setForm((prev) => ({
      R2_ENDPOINT: values.R2_ENDPOINT ?? prev.R2_ENDPOINT,
      R2_ACCESS_KEY_ID: values.R2_ACCESS_KEY_ID ?? prev.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY:
        values.R2_SECRET_ACCESS_KEY ?? prev.R2_SECRET_ACCESS_KEY,
      R2_ACCOUNT_ID: values.R2_ACCOUNT_ID ?? prev.R2_ACCOUNT_ID,
      R2_CF_API_TOKEN: values.R2_CF_API_TOKEN ?? prev.R2_CF_API_TOKEN,
    }));
    const fields = (Object.keys(values) as R2CredentialField[])
      .map((k) => FIELD_LABEL_CN[k])
      .join("、");
    toast.success(`已解析 ${matchedCount} 项：${fields}`);
  };

  /** 直接读取系统剪贴板的内容并解析 */
  const handlePasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        toast.error("当前浏览器不支持剪贴板读取，请手动粘贴");
        return;
      }
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.error("剪贴板为空");
        return;
      }
      setBulkText(text);
      handleParseBulk(text);
    } catch (err) {
      toast.error("读取剪贴板失败：" + String(err));
    }
  };

  /** 把当前表单内容整段复制，方便迁移/备份 */
  const handleCopyCurrent = async (maskSecrets: boolean) => {
    const hasAny = Object.values(form).some((v) => v);
    if (!hasAny) {
      toast.error("表单为空，暂无内容可复制");
      return;
    }
    const text = formatR2Credentials(form, { maskSecrets });
    try {
      await navigator.clipboard.writeText(text);
      toast.success(
        maskSecrets ? "已复制（密钥已脱敏）" : "已复制完整账号信息到剪贴板",
      );
    } catch {
      // 回退方案：写入 bulkText 供用户手动复制
      setBulkText(text);
      toast.message("浏览器阻止了自动复制，内容已填入上方文本框，请手动复制");
    }
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings2 className="w-6 h-6 text-primary" />
          R2 凭证配置
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          配置 Cloudflare R2 访问凭证，凭证通过环境变量安全存储在服务端。
        </p>
      </div>

      {/* 当前状态 */}
      <Card className="mb-6 border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            当前配置状态
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-sm text-muted-foreground">R2 S3 凭证</span>
              {status?.configured ? (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1">
                  <CheckCircle2 className="w-3 h-3" /> 已配置
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1 bg-red-500/20 text-red-400 border-red-500/30">
                  <XCircle className="w-3 h-3" /> 未配置
                </Badge>
              )}
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-sm text-muted-foreground">CF API Token</span>
              {status?.hasCfToken ? (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1">
                  <CheckCircle2 className="w-3 h-3" /> 已配置
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-yellow-400 border-yellow-500/30">
                  <Info className="w-3 h-3" /> 未配置（列桶功能不可用）
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 一键粘贴解析 */}
      <Card className="mb-6 border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardPaste className="w-4 h-4 text-primary" />
            一键粘贴整段账号信息
          </CardTitle>
          <CardDescription>
            直接把 Cloudflare 控制台或笔记里的整段文本贴进来，系统会自动解析
            Endpoint、Access Key、Secret、Account ID、API Token 等字段并填入下方表单。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={`示例：\nS3 终端节点 Endpoint:\nhttps://xxxx.r2.cloudflarestorage.com\n访问密钥 ID:\nxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n机密访问密钥:\nxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\nAccount ID:\nxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\nCloudflare API Token:\ncfat_xxxxxxxxxxxxxxxxxxxxxxxx`}
            className="min-h-[160px] bg-input border-border font-mono text-xs leading-relaxed"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => handleParseBulk()}
              className="gap-1.5"
            >
              <Wand2 className="w-4 h-4" /> 解析并填入
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handlePasteFromClipboard}
              className="gap-1.5"
            >
              <ClipboardPaste className="w-4 h-4" /> 从剪贴板读取并解析
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleCopyCurrent(false)}
              className="gap-1.5"
            >
              <Copy className="w-4 h-4" /> 复制当前配置
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleCopyCurrent(true)}
              className="gap-1.5"
            >
              <Copy className="w-4 h-4" /> 复制（脱敏）
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setBulkText("")}
              className="gap-1.5 text-muted-foreground"
            >
              <Eraser className="w-4 h-4" /> 清空
            </Button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            支持中/英文 Label、任意字段顺序、Label 与值同行或换行。解析后请到下方表单确认无误再点击
            <strong className="text-foreground"> 保存凭证</strong>。
          </p>
        </CardContent>
      </Card>

      {/* 凭证填写表单 */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" />
            填写 R2 凭证
          </CardTitle>
          <CardDescription>
            凭证将通过服务端环境变量安全存储，不会暴露在前端代码中。
            <a
              href="https://dash.cloudflare.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline ml-1 inline-flex items-center gap-1"
            >
              前往 Cloudflare 控制台 <ExternalLink className="w-3 h-3" />
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* S3 终端节点 */}
          <div className="space-y-2">
            <Label htmlFor="endpoint" className="text-sm font-medium flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-primary" />
              S3 终端节点（Endpoint） <span className="text-destructive">*</span>
            </Label>
            <Input
              id="endpoint"
              placeholder="https://xxxxxxxx.r2.cloudflarestorage.com"
              value={form.R2_ENDPOINT}
              onChange={(e) => setForm((f) => ({ ...f, R2_ENDPOINT: e.target.value }))}
              className="bg-input border-border font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              在 R2 → 管理 R2 API 令牌 → 为 S3 客户端使用管辖地特定的终端节点 中复制（默认选项）
            </p>
          </div>

          <Separator className="bg-border" />

          {/* Access Key / Secret */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">R2 API 令牌（S3 兼容）</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSecrets(!showSecrets)}
              className="h-7 text-xs gap-1"
            >
              {showSecrets ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showSecrets ? "隐藏" : "显示"}
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="access-key" className="text-sm font-medium">
              访问密钥 ID（Access Key ID） <span className="text-destructive">*</span>
            </Label>
            <Input
              id="access-key"
              type={showSecrets ? "text" : "password"}
              placeholder="R2 API 令牌的访问密钥 ID"
              value={form.R2_ACCESS_KEY_ID}
              onChange={(e) => setForm((f) => ({ ...f, R2_ACCESS_KEY_ID: e.target.value }))}
              className="bg-input border-border font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="secret-key" className="text-sm font-medium">
              机密访问密钥（Secret Access Key） <span className="text-destructive">*</span>
            </Label>
            <Input
              id="secret-key"
              type={showSecrets ? "text" : "password"}
              placeholder="R2 API 令牌的机密访问密钥"
              value={form.R2_SECRET_ACCESS_KEY}
              onChange={(e) => setForm((f) => ({ ...f, R2_SECRET_ACCESS_KEY: e.target.value }))}
              className="bg-input border-border font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              在 R2 → 管理 R2 API 令牌 → 创建 API 令牌 中获取访问密钥 ID 和机密访问密钥
            </p>
          </div>

          <Separator className="bg-border" />

          {/* Account ID（可选，当没有 Endpoint 时使用） */}
          <div className="space-y-2">
            <Label htmlFor="account-id" className="text-sm font-medium">
              Account ID{" "}
              <span className="text-xs text-muted-foreground font-normal">（可选，Endpoint 中已包含）</span>
            </Label>
            <Input
              id="account-id"
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={form.R2_ACCOUNT_ID}
              onChange={(e) => setForm((f) => ({ ...f, R2_ACCOUNT_ID: e.target.value }))}
              className="bg-input border-border font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Endpoint URL 中的第一段即为 Account ID，通常无需单独填写
            </p>
          </div>

          <Separator className="bg-border" />

          {/* CF API Token */}
          <div className="space-y-2">
            <Label htmlFor="cf-token" className="text-sm font-medium">
              Cloudflare API Token{" "}
              <span className="text-xs text-muted-foreground font-normal">（可选，用于列出存储桶）</span>
            </Label>
            <Input
              id="cf-token"
              type={showSecrets ? "text" : "password"}
              placeholder="cfat_xxxxxxxx..."
              value={form.R2_CF_API_TOKEN}
              onChange={(e) => setForm((f) => ({ ...f, R2_CF_API_TOKEN: e.target.value }))}
              className="bg-input border-border font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              在 Cloudflare 控制台 → 我的个人资料 → API 令牌 → 创建令牌 中获取（需要 R2:Read 权限）
            </p>
          </div>

          <div className="pt-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? "保存中..." : "保存凭证"}
            </Button>
          </div>

          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-primary">安全说明：</strong>
              凭证通过服务端环境变量存储，不会出现在前端代码或网络请求中。
              如需永久保存（重启后依然有效），请通过项目 Secrets 管理面板配置。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
