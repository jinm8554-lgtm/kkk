import { trpc } from "@/lib/trpc";
import { useR2 } from "@/contexts/R2Context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import {
  Database,
  CheckCircle2,
  XCircle,
  FolderOpen,
  ArrowRight,
  Settings2,
  Zap,
  Shield,
  HardDrive,
} from "lucide-react";

export default function Dashboard() {
  const { data: status, isLoading: statusLoading } = trpc.r2.status.useQuery();
  const { data: bucketsData, isLoading: bucketsLoading } = trpc.r2.listBuckets.useQuery(undefined, {
    enabled: Boolean(status?.hasCfToken),
    retry: false,
  });
  const { currentBucket, setCurrentBucket } = useR2();
  const [, navigate] = useLocation();

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Zap className="w-6 h-6 text-primary" />
          R2 Manager
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Cloudflare R2 私有对象存储管理工具
        </p>
      </div>

      {/* 状态卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="border-border bg-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              {statusLoading ? (
                <Skeleton className="h-6 w-16 bg-muted" />
              ) : status?.configured ? (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1">
                  <CheckCircle2 className="w-3 h-3" /> 已配置
                </Badge>
              ) : (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1">
                  <XCircle className="w-3 h-3" /> 未配置
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium text-foreground">R2 凭证</p>
            <p className="text-xs text-muted-foreground mt-0.5">S3 兼容 API 访问凭证</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Database className="w-5 h-5 text-primary" />
              </div>
              {bucketsLoading ? (
                <Skeleton className="h-6 w-12 bg-muted" />
              ) : (
                <span className="text-2xl font-bold text-foreground">
                  {bucketsData?.buckets.length ?? "-"}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-foreground">存储桶</p>
            <p className="text-xs text-muted-foreground mt-0.5">账号下的 R2 存储桶数量</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <HardDrive className="w-5 h-5 text-primary" />
              </div>
              <Badge variant="outline" className="border-border text-muted-foreground text-xs">
                {currentBucket || "未选择"}
              </Badge>
            </div>
            <p className="text-sm font-medium text-foreground">当前存储桶</p>
            <p className="text-xs text-muted-foreground mt-0.5">正在操作的存储桶</p>
          </CardContent>
        </Card>
      </div>

      {/* 快速入口 */}
      {!status?.configured && (
        <Card className="border-primary/30 bg-primary/5 mb-6">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">开始使用</p>
                <p className="text-sm text-muted-foreground mt-1">
                  请先配置 Cloudflare R2 凭证以开始使用文件管理功能
                </p>
              </div>
              <Button
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                onClick={() => navigate("/settings")}
              >
                <Settings2 className="w-4 h-4" />
                配置凭证
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 存储桶列表 */}
      {bucketsData?.buckets && bucketsData.buckets.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            存储桶
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {bucketsData.buckets.map((bucket) => (
              <button
                key={bucket.name}
                className="group text-left"
                onClick={() => {
                  setCurrentBucket(bucket.name);
                  navigate("/files");
                }}
              >
                <Card
                  className={`border transition-all duration-200 hover:border-primary/50 cursor-pointer ${
                    currentBucket === bucket.name
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:bg-accent/30"
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Database
                          className={`w-4 h-4 ${
                            currentBucket === bucket.name ? "text-primary" : "text-muted-foreground"
                          }`}
                        />
                        <span className="font-medium text-sm text-foreground truncate">
                          {bucket.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {currentBucket === bucket.name && (
                          <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                            当前
                          </Badge>
                        )}
                        <FolderOpen className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 功能说明 */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          {
            icon: <FolderOpen className="w-5 h-5 text-primary" />,
            title: "文件浏览",
            desc: "目录导航、面包屑路径、表格/网格视图切换",
          },
          {
            icon: <Database className="w-5 h-5 text-primary" />,
            title: "文件夹上传",
            desc: "递归遍历本地文件夹，保留完整目录结构批量上传",
          },
          {
            icon: <HardDrive className="w-5 h-5 text-primary" />,
            title: "文件夹下载",
            desc: "递归列出所有文件，打包为 ZIP 保留目录结构下载",
          },
          {
            icon: <Shield className="w-5 h-5 text-primary" />,
            title: "私有代理访问",
            desc: "服务端流式代理，无需开启 R2 公开访问",
          },
        ].map((f, i) => (
          <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-muted/30 border border-border/50">
            <div className="p-2 rounded-lg bg-primary/10 shrink-0">{f.icon}</div>
            <div>
              <p className="text-sm font-medium text-foreground">{f.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
