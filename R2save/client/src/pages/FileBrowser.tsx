import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useR2 } from "@/contexts/R2Context";
import { useDownload, type StreamDownloadEntry } from "@/hooks/useDownload";
import { FileIcon } from "@/components/FileIcon";
import { FilePreview } from "@/components/FilePreview";
import { UploadPanel } from "@/components/UploadPanel";
import { DeleteConfirm } from "@/components/DeleteConfirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { formatSize, formatDate, type SortField, type SortOrder, type ViewMode } from "@/lib/r2Types";
import type { R2Item } from "@/lib/r2Types";
import {
  ChevronRight,
  Home,
  RefreshCw,
  Upload,
  Download,
  Trash2,
  Search,
  LayoutGrid,
  LayoutList,
  ArrowUpDown,
  MoreHorizontal,
  Eye,
  FolderDown,
  AlertCircle,
  Settings2,
  ChevronUp,
  ChevronDown,
  Loader2,
  FolderOpen,
  PackageOpen,
} from "lucide-react";
import { useLocation } from "wouter";

export default function FileBrowser() {
  const { currentBucket, currentPrefix, navigateTo, navigateUp, breadcrumbs } = useR2();
  const [, navigate] = useLocation();

  // UI 状态
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // 对话框状态
  const [showUpload, setShowUpload] = useState(false);
  const [previewFile, setPreviewFile] = useState<R2Item | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string[] | null>(null);

  const {
    progress: dlProgress,
    downloadSingle,
    downloadFolder,
    downloadStreamSelected,
    downloadDirectToFolder,
  } = useDownload(currentBucket);
  const deleteObjects = trpc.r2.deleteObjects.useMutation();

  const { data, isLoading, error, refetch, isFetching } = trpc.r2.listObjects.useQuery(
    { bucket: currentBucket, prefix: currentPrefix, recursive: false },
    { enabled: Boolean(currentBucket), retry: false }
  );

  // 合并文件和文件夹
  const allItems = useMemo((): R2Item[] => {
    const folders = (data?.folders ?? []) as R2Item[];
    const files = (data?.files ?? []) as R2Item[];
    return [...folders, ...files];
  }, [data]);

  // 搜索过滤
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return allItems;
    const q = searchQuery.toLowerCase();
    return allItems.filter((item) => item.name.toLowerCase().includes(q));
  }, [allItems, searchQuery]);

  // 排序
  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      // 文件夹始终排在前面
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;

      let cmp = 0;
      if (sortField === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (!a.isFolder && !b.isFolder) {
        if (sortField === "size") cmp = a.size - b.size;
        else if (sortField === "lastModified") cmp = a.lastModified.localeCompare(b.lastModified);
        else if (sortField === "type") {
          const extA = a.name.split(".").pop() ?? "";
          const extB = b.name.split(".").pop() ?? "";
          cmp = extA.localeCompare(extB);
        }
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [filteredItems, sortField, sortOrder]);

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortOrder("asc");
      }
    },
    [sortField]
  );

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-muted-foreground" />;
    return sortOrder === "asc" ? (
      <ChevronUp className="w-3 h-3 text-primary" />
    ) : (
      <ChevronDown className="w-3 h-3 text-primary" />
    );
  };

  // 选择逻辑：同时覆盖文件和文件夹，支持全选/取消和 indeterminate 状态
  const selectableItems = sortedItems; // 文件与文件夹都可勾选
  const selectedCount = selectableItems.filter((i) => selectedKeys.has(i.key)).length;
  const allSelected = selectableItems.length > 0 && selectedCount === selectableItems.length;
  const someSelected = selectedKeys.size > 0;
  const indeterminate = selectedCount > 0 && selectedCount < selectableItems.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(selectableItems.map((i) => i.key)));
    }
  };

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 删除处理
  const handleDelete = async (keys: string[]) => {
    try {
      await deleteObjects.mutateAsync({ bucket: currentBucket, keys });
      toast.success(`已删除 ${keys.length} 个文件`);
      setSelectedKeys(new Set());
      refetch();
    } catch (err) {
      toast.error(`删除失败：${err}`);
    }
    setDeleteTarget(null);
  };

  /**
   * 将当前勾选的项目整理为 StreamDownloadEntry 列表；
   * ZIP 流式下载 与 批量直下 两种模式共用这份输入。
   */
  const collectSelectedEntries = (): StreamDownloadEntry[] =>
    sortedItems
      .filter((i) => selectedKeys.has(i.key))
      .map((i) => ({ isFolder: i.isFolder, key: i.key, name: i.name }));

  // 批量流式下载（ZIP 打包）：点击立即弹 "另存为"，再拉取并流式写入
  const handleStreamDownloadZip = () => {
    const entries = collectSelectedEntries();
    if (!entries.length) {
      toast.error("请先勾选要下载的文件或文件夹");
      return;
    }
    downloadStreamSelected(entries, currentBucket);
  };

  // 批量直下（逐文件，保留相对路径）：点击立即弹 "选择目录"，再逐文件写入
  const handleDirectDownload = () => {
    const entries = collectSelectedEntries();
    if (!entries.length) {
      toast.error("请先勾选要下载的文件或文件夹");
      return;
    }
    downloadDirectToFolder(entries);
  };

  if (!currentBucket) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 gap-4">
        <PackageOpen className="w-16 h-16 text-muted-foreground opacity-30" />
        <p className="text-muted-foreground">请先选择一个存储桶</p>
        <Button variant="outline" className="gap-2 border-border" onClick={() => navigate("/buckets")}>
          <Settings2 className="w-4 h-4" />
          前往存储桶列表
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部工具栏 */}
      <div className="px-6 pt-5 pb-4 border-b border-border shrink-0">
        {/* 面包屑 */}
        <div className="flex items-center gap-1 text-sm mb-4 flex-wrap">
          <button
            onClick={() => navigateTo("")}
            className="flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
            <span>{currentBucket}</span>
          </button>
          {breadcrumbs.slice(1).map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
              <button
                onClick={() => navigateTo(crumb.prefix)}
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        {/* 操作栏 */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* 搜索框 */}
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索文件名..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-input border-border h-9 text-sm"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* 批量操作 */}
            {someSelected && (
              <>
                <Badge variant="outline" className="border-primary/30 text-primary">
                  已选 {selectedKeys.size}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10 h-9"
                      disabled={dlProgress.active}
                      title="选择下载方式"
                    >
                      <Download className="w-3.5 h-3.5" />
                      下载
                      <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuItem
                      onClick={handleStreamDownloadZip}
                      className="flex flex-col items-start gap-0.5 cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5 text-sm">
                        <PackageOpen className="w-3.5 h-3.5" />
                        流式下载（ZIP 打包）
                      </span>
                      <span className="text-xs text-muted-foreground pl-5">
                        先选保存位置，服务端流式代理，合并为一个 .zip
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleDirectDownload}
                      className="flex flex-col items-start gap-0.5 cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5 text-sm">
                        <FolderDown className="w-3.5 h-3.5" />
                        批量直下（逐文件）
                      </span>
                      <span className="text-xs text-muted-foreground pl-5">
                        选一个本地目录，保留原相对路径直接保存到 PC
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 h-9"
                  onClick={() => setDeleteTarget(Array.from(selectedKeys))}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  删除
                </Button>
              </>
            )}

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-border h-9"
              onClick={() => setShowUpload(true)}
            >
              <Upload className="w-3.5 h-3.5" />
              上传
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>

            <div className="flex border border-border rounded-md overflow-hidden">
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="icon"
                className="h-9 w-9 rounded-none"
                onClick={() => setViewMode("table")}
              >
                <LayoutList className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                className="h-9 w-9 rounded-none"
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 下载进度条 */}
      {dlProgress.active && (
        <div className="px-6 py-2 border-b border-border bg-primary/5 shrink-0">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
              {dlProgress.label}
            </span>
            <span>{dlProgress.percent}%</span>
          </div>
          <Progress value={dlProgress.percent} className="h-1 bg-muted" />
        </div>
      )}

      {/* 文件列表 */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-6 space-y-2">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-12 bg-muted rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertCircle className="w-10 h-10 text-destructive opacity-60" />
            <p className="text-muted-foreground">{String(error)}</p>
            <Button variant="outline" size="sm" className="border-border" onClick={() => navigate("/settings")}>
              检查凭证配置
            </Button>
          </div>
        ) : sortedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <FolderOpen className="w-12 h-12 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground">
              {searchQuery ? "没有匹配的文件" : "此目录为空"}
            </p>
            {!searchQuery && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-border"
                onClick={() => setShowUpload(true)}
              >
                <Upload className="w-3.5 h-3.5" />
                上传文件
              </Button>
            )}
          </div>
        ) : viewMode === "table" ? (
          <TableView
            items={sortedItems}
            selectedKeys={selectedKeys}
            allSelected={allSelected}
            indeterminate={indeterminate}
            onToggleAll={toggleSelectAll}
            onToggleSelect={toggleSelect}
            onNavigate={navigateTo}
            onPreview={setPreviewFile}
            onDownload={downloadSingle}
            onDownloadFolder={downloadFolder}
            onDelete={(key, name) => setDeleteTarget([key])}
            SortIcon={SortIcon}
            onSort={toggleSort}
          />
        ) : (
          <GridView
            items={sortedItems}
            selectedKeys={selectedKeys}
            onToggleSelect={toggleSelect}
            onNavigate={navigateTo}
            onPreview={setPreviewFile}
            onDownload={downloadSingle}
            onDownloadFolder={downloadFolder}
            onDelete={(key, name) => setDeleteTarget([key])}
            bucket={currentBucket}
          />
        )}
      </div>

      {/* 状态栏 */}
      <div className="px-6 py-2 border-t border-border text-xs text-muted-foreground flex items-center gap-4 shrink-0">
        <span>{sortedItems.length} 个项目</span>
        {someSelected && <span>{selectedKeys.size} 个已选</span>}
        {data?.isTruncated && (
          <Badge variant="outline" className="text-xs border-yellow-500/30 text-yellow-400">
            结果已截断（超过 1000 个）
          </Badge>
        )}
      </div>

      {/* 上传对话框 */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="max-w-2xl bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              上传文件
              {currentPrefix && (
                <Badge variant="outline" className="text-xs border-border font-normal">
                  → {currentPrefix}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <UploadPanel
            bucket={currentBucket}
            prefix={currentPrefix}
            onComplete={() => { refetch(); }}
            onClose={() => setShowUpload(false)}
          />
        </DialogContent>
      </Dialog>

      {/* 预览对话框 */}
      <FilePreview
        open={Boolean(previewFile)}
        onClose={() => setPreviewFile(null)}
        file={previewFile && !previewFile.isFolder ? previewFile : null}
        bucket={currentBucket}
        onDownload={downloadSingle}
      />

      {/* 删除确认 */}
      <DeleteConfirm
        open={Boolean(deleteTarget)}
        count={deleteTarget?.length ?? 0}
        names={deleteTarget?.map((k) => k.split("/").pop() ?? k)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ─── 表格视图 ─────────────────────────────────────────────────────────────────
function TableView({
  items,
  selectedKeys,
  allSelected,
  indeterminate,
  onToggleAll,
  onToggleSelect,
  onNavigate,
  onPreview,
  onDownload,
  onDownloadFolder,
  onDelete,
  SortIcon,
  onSort,
}: {
  items: R2Item[];
  selectedKeys: Set<string>;
  allSelected: boolean;
  indeterminate: boolean;
  onToggleAll: () => void;
  onToggleSelect: (key: string) => void;
  onNavigate: (prefix: string) => void;
  onPreview: (item: R2Item) => void;
  onDownload: (key: string, name: string) => void;
  onDownloadFolder: (prefix: string, name: string) => void;
  onDelete: (key: string, name: string) => void;
  SortIcon: React.ComponentType<{ field: SortField }>;
  onSort: (field: SortField) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border z-10">
        <tr>
          <th className="w-10 px-4 py-3">
            <Checkbox
              checked={allSelected ? true : indeterminate ? "indeterminate" : false}
              onCheckedChange={onToggleAll}
              className="border-border"
              aria-label="全选 / 取消全选"
            />
          </th>
          <th className="text-left px-3 py-3 font-medium text-muted-foreground">
            <button
              className="flex items-center gap-1 hover:text-foreground transition-colors"
              onClick={() => onSort("name")}
            >
              名称 <SortIcon field="name" />
            </button>
          </th>
          <th className="text-right px-3 py-3 font-medium text-muted-foreground w-28">
            <button
              className="flex items-center gap-1 hover:text-foreground transition-colors ml-auto"
              onClick={() => onSort("size")}
            >
              大小 <SortIcon field="size" />
            </button>
          </th>
          <th className="text-right px-3 py-3 font-medium text-muted-foreground w-44">
            <button
              className="flex items-center gap-1 hover:text-foreground transition-colors ml-auto"
              onClick={() => onSort("lastModified")}
            >
              修改时间 <SortIcon field="lastModified" />
            </button>
          </th>
          <th className="text-right px-3 py-3 font-medium text-muted-foreground w-20">
            类型
          </th>
          <th className="w-12 px-3 py-3" />
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr
            key={item.key}
            className={`border-b border-border/50 hover:bg-accent/30 transition-colors group ${
              selectedKeys.has(item.key) ? "bg-primary/5" : ""
            }`}
          >
            <td className="px-4 py-3">
              <Checkbox
                checked={selectedKeys.has(item.key)}
                onCheckedChange={() => onToggleSelect(item.key)}
                className="border-border"
                aria-label={`选中 ${item.name}`}
              />
            </td>
            <td className="px-3 py-3">
              <button
                className="flex items-center gap-2.5 text-left w-full group/name"
                onClick={() => {
                  if (item.isFolder) onNavigate(item.key);
                  else onPreview(item);
                }}
              >
                <FileIcon
                  name={item.name}
                  isFolder={item.isFolder}
                  contentType={item.isFolder ? undefined : item.contentType}
                  className="w-4 h-4 shrink-0"
                />
                <span className="truncate text-foreground group-hover/name:text-primary transition-colors">
                  {item.name}
                </span>
              </button>
            </td>
            <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">
              {item.isFolder ? "-" : formatSize(item.size)}
            </td>
            <td className="px-3 py-3 text-right text-muted-foreground tabular-nums text-xs">
              {item.isFolder ? "-" : formatDate(item.lastModified)}
            </td>
            <td className="px-3 py-3 text-right">
              {!item.isFolder && (
                <Badge variant="outline" className="text-xs border-border/50 text-muted-foreground">
                  {item.name.split(".").pop()?.toUpperCase() ?? "FILE"}
                </Badge>
              )}
            </td>
            <td className="px-3 py-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover border-border text-foreground w-40">
                  {item.isFolder ? (
                    <>
                      <DropdownMenuItem
                        className="gap-2 cursor-pointer"
                        onClick={() => onNavigate(item.key)}
                      >
                        <FolderOpen className="w-4 h-4" />
                        打开
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2 cursor-pointer"
                        onClick={() => onDownloadFolder(item.key, item.name)}
                      >
                        <FolderDown className="w-4 h-4" />
                        下载文件夹
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      <DropdownMenuItem
                        className="gap-2 cursor-pointer"
                        onClick={() => onPreview(item)}
                      >
                        <Eye className="w-4 h-4" />
                        预览
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2 cursor-pointer"
                        onClick={() => onDownload(item.key, item.name)}
                      >
                        <Download className="w-4 h-4" />
                        下载
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-border" />
                      <DropdownMenuItem
                        className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                        onClick={() => onDelete(item.key, item.name)}
                      >
                        <Trash2 className="w-4 h-4" />
                        删除
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── 网格视图 ─────────────────────────────────────────────────────────────────
function GridView({
  items,
  selectedKeys,
  onToggleSelect,
  onNavigate,
  onPreview,
  onDownload,
  onDownloadFolder,
  onDelete,
  bucket,
}: {
  items: R2Item[];
  selectedKeys: Set<string>;
  onToggleSelect: (key: string) => void;
  onNavigate: (prefix: string) => void;
  onPreview: (item: R2Item) => void;
  onDownload: (key: string, name: string) => void;
  onDownloadFolder: (prefix: string, name: string) => void;
  onDelete: (key: string, name: string) => void;
  bucket: string;
}) {
  const isImage = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    return ["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"].includes(ext);
  };

  return (
    <div className="p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {items.map((item) => (
        <div
          key={item.key}
          className={`group relative rounded-xl border transition-all duration-200 overflow-hidden cursor-pointer ${
            selectedKeys.has(item.key)
              ? "border-primary bg-primary/5"
              : "border-border bg-card hover:border-primary/40 hover:bg-accent/30"
          }`}
          onClick={() => {
            if (item.isFolder) onNavigate(item.key);
            else onPreview(item);
          }}
        >
          {/* 选择框：文件和文件夹都可勾选（已选中时常驻显示） */}
          <div
            className={`absolute top-2 left-2 z-10 transition-opacity ${
              selectedKeys.has(item.key) ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
            onClick={(e) => { e.stopPropagation(); onToggleSelect(item.key); }}
          >
            <Checkbox
              checked={selectedKeys.has(item.key)}
              className="border-white/70 bg-black/30 backdrop-blur-sm"
              aria-label={`选中 ${item.name}`}
            />
          </div>

          {/* 操作菜单 */}
          <div
            className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 bg-black/40 backdrop-blur-sm hover:bg-black/60 text-white"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover border-border text-foreground w-40">
                {item.isFolder ? (
                  <>
                    <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onNavigate(item.key)}>
                      <FolderOpen className="w-4 h-4" /> 打开
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onDownloadFolder(item.key, item.name)}>
                      <FolderDown className="w-4 h-4" /> 下载文件夹
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onPreview(item)}>
                      <Eye className="w-4 h-4" /> 预览
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onDownload(item.key, item.name)}>
                      <Download className="w-4 h-4" /> 下载
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-border" />
                    <DropdownMenuItem className="gap-2 cursor-pointer text-destructive focus:text-destructive" onClick={() => onDelete(item.key, item.name)}>
                      <Trash2 className="w-4 h-4" /> 删除
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* 缩略图 / 图标 */}
          <div className="aspect-square flex items-center justify-center bg-muted/30 overflow-hidden">
            {!item.isFolder && isImage(item.name) ? (
              <img
                src={`/api/r2-proxy/${bucket}/${item.key}`}
                alt={item.name}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <FileIcon
                name={item.name}
                isFolder={item.isFolder}
                contentType={item.isFolder ? undefined : item.contentType}
                className="w-10 h-10"
              />
            )}
          </div>

          {/* 文件名 */}
          <div className="px-2 py-2">
            <p className="text-xs font-medium truncate text-foreground">{item.name}</p>
            {!item.isFolder && (
              <p className="text-xs text-muted-foreground mt-0.5">{formatSize(item.size)}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
