import { trpc } from "@/lib/trpc";
import { useR2 } from "@/contexts/R2Context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Database,
  FolderOpen,
  Calendar,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Settings2,
} from "lucide-react";

export default function Buckets() {
  const { currentBucket, setCurrentBucket } = useR2();
  const [, navigate] = useLocation();

  const { data, isLoading, error, refetch, isFetching } = trpc.r2.listBuckets.useQuery(undefined, {
    retry: false,
  });

  const handleSelectBucket = (name: string) => {
    setCurrentBucket(name);
    toast.success(`已切换到存储桶：${name}`);
    navigate("/files");
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <Skeleton className="h-8 w-48 bg-muted" />
          <Skeleton className="h-4 w-72 mt-2 bg-muted" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 bg-muted rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Database className="w-6 h-6 text-primary" />
            存储桶
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            选择要操作的 Cloudflare R2 存储桶
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2 border-border"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          刷新
        </Button>
      </div>

      {error || data?.error ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-destructive">加载失败</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {data?.error ?? String(error)}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-2 border-border"
                  onClick={() => navigate("/settings")}
                >
                  <Settings2 className="w-4 h-4" />
                  前往配置凭证
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : !data?.buckets.length ? (
        <div className="text-center py-16">
          <Database className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
          <p className="text-muted-foreground">未找到任何存储桶</p>
          <p className="text-sm text-muted-foreground mt-1">
            请确认 Cloudflare API Token 已正确配置且具有 R2:Read 权限
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.buckets.map((bucket) => (
            <button
              key={bucket.name}
              onClick={() => handleSelectBucket(bucket.name)}
              className="group text-left"
            >
              <Card
                className={`border transition-all duration-200 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 cursor-pointer ${
                  currentBucket === bucket.name
                    ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                    : "border-border bg-card hover:bg-accent/30"
                }`}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className={`p-2 rounded-lg ${
                        currentBucket === bucket.name
                          ? "bg-primary/20"
                          : "bg-muted group-hover:bg-primary/10"
                      }`}
                    >
                      <Database
                        className={`w-5 h-5 ${
                          currentBucket === bucket.name
                            ? "text-primary"
                            : "text-muted-foreground group-hover:text-primary"
                        }`}
                      />
                    </div>
                    {currentBucket === bucket.name && (
                      <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                        当前
                      </Badge>
                    )}
                  </div>

                  <h3 className="font-semibold text-foreground truncate mb-1">{bucket.name}</h3>

                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    <span>
                      {bucket.creationDate
                        ? new Date(bucket.creationDate).toLocaleDateString("zh-CN")
                        : "未知"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <FolderOpen className="w-3 h-3" />
                      浏览文件
                    </span>
                    <ChevronRight
                      className={`w-4 h-4 transition-transform group-hover:translate-x-1 ${
                        currentBucket === bucket.name ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
