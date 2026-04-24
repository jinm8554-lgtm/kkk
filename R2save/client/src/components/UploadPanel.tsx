import { useState, useRef, useCallback, DragEvent } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getMimeType } from "@/lib/r2Types";
import {
  Upload,
  FolderUp,
  X,
  CheckCircle2,
  AlertCircle,
  FileUp,
  Loader2,
} from "lucide-react";

interface UploadTask {
  id: string;
  name: string;
  key: string;
  size: number;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

interface UploadPanelProps {
  bucket: string;
  prefix: string;
  onComplete: () => void;
  onClose: () => void;
}

const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB 以上用预签名直传
const CONCURRENCY = 3; // 并发上传数

export function UploadPanel({ bucket, prefix, onComplete, onClose }: UploadPanelProps) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const getUploadUrl = trpc.r2.getUploadUrl.useMutation();
  const uploadFileProxy = trpc.r2.uploadFile.useMutation();

  const buildKey = (filename: string) => {
    const p = prefix ? prefix.replace(/\/$/, "") + "/" : "";
    return `${p}${filename}`;
  };

  const updateTask = useCallback((id: string, update: Partial<UploadTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...update } : t)));
  }, []);

  /** 上传单个文件 */
  const uploadSingleFile = useCallback(
    async (file: File, key: string, taskId: string) => {
      updateTask(taskId, { status: "uploading", progress: 0 });
      try {
        if (file.size >= LARGE_FILE_THRESHOLD) {
          // 大文件：预签名直传
          const { presignedUrl } = await getUploadUrl.mutateAsync({
            bucket,
            key,
            contentType: file.type || getMimeType(file.name),
          });

          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                updateTask(taskId, { progress: Math.round((e.loaded / e.total) * 100) });
              }
            };
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) resolve();
              else reject(new Error(`HTTP ${xhr.status}`));
            };
            xhr.onerror = () => reject(new Error("网络错误"));
            xhr.open("PUT", presignedUrl);
            xhr.setRequestHeader("Content-Type", file.type || getMimeType(file.name));
            xhr.send(file);
          });
        } else {
          // 小文件：服务端代理上传（base64）
          const buffer = await file.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
          );
          updateTask(taskId, { progress: 50 });
          await uploadFileProxy.mutateAsync({
            bucket,
            key,
            content: base64,
            contentType: file.type || getMimeType(file.name),
          });
        }
        updateTask(taskId, { status: "done", progress: 100 });
      } catch (err) {
        updateTask(taskId, { status: "error", error: String(err) });
      }
    },
    [bucket, getUploadUrl, uploadFileProxy, updateTask]
  );

  /** 处理文件列表（支持文件夹结构） */
  const processFiles = useCallback(
    async (fileList: Array<{ file: File; relativePath: string }>) => {
      if (!bucket) {
        toast.error("请先选择存储桶");
        return;
      }

      const newTasks: UploadTask[] = fileList.map(({ file, relativePath }) => ({
        id: crypto.randomUUID(),
        name: relativePath || file.name,
        key: buildKey(relativePath || file.name),
        size: file.size,
        status: "pending",
        progress: 0,
      }));

      setTasks((prev) => [...prev, ...newTasks]);
      setIsUploading(true);

      // 并发上传
      const chunks: typeof newTasks[] = [];
      for (let i = 0; i < newTasks.length; i += CONCURRENCY) {
        chunks.push(newTasks.slice(i, i + CONCURRENCY));
      }

      const fileMap = new Map(
        fileList.map(({ file, relativePath }, i) => [newTasks[i].id, file])
      );

      for (const chunk of chunks) {
        await Promise.allSettled(
          chunk.map((task) => {
            const file = fileMap.get(task.id);
            if (!file) return Promise.resolve();
            return uploadSingleFile(file, task.key, task.id);
          })
        );
      }

      setIsUploading(false);
      const doneCount = newTasks.length;
      toast.success(`上传完成，共 ${doneCount} 个文件`);
      onComplete();
    },
    [bucket, prefix, uploadSingleFile, onComplete]
  );

  /** 从 DataTransfer 递归读取文件夹 */
  const readDirectory = async (
    entry: FileSystemDirectoryEntry,
    basePath: string
  ): Promise<Array<{ file: File; relativePath: string }>> => {
    const results: Array<{ file: File; relativePath: string }> = [];
    const reader = entry.createReader();

    const readEntries = (): Promise<FileSystemEntry[]> =>
      new Promise((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });

    let entries: FileSystemEntry[] = [];
    let batch: FileSystemEntry[];
    do {
      batch = await readEntries();
      entries = entries.concat(batch);
    } while (batch.length > 0);

    for (const childEntry of entries) {
      const childPath = basePath ? `${basePath}/${childEntry.name}` : childEntry.name;
      if (childEntry.isFile) {
        const file = await new Promise<File>((resolve, reject) =>
          (childEntry as FileSystemFileEntry).file(resolve, reject)
        );
        results.push({ file, relativePath: childPath });
      } else if (childEntry.isDirectory) {
        const subResults = await readDirectory(childEntry as FileSystemDirectoryEntry, childPath);
        results.push(...subResults);
      }
    }
    return results;
  };

  /** 拖拽放置处理 */
  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);

      const items = Array.from(e.dataTransfer.items);
      const allFiles: Array<{ file: File; relativePath: string }> = [];

      for (const item of items) {
        const entry = item.webkitGetAsEntry?.();
        if (!entry) continue;

        if (entry.isFile) {
          const file = await new Promise<File>((resolve, reject) =>
            (entry as FileSystemFileEntry).file(resolve, reject)
          );
          allFiles.push({ file, relativePath: file.name });
        } else if (entry.isDirectory) {
          const dirFiles = await readDirectory(entry as FileSystemDirectoryEntry, entry.name);
          allFiles.push(...dirFiles);
        }
      }

      if (allFiles.length > 0) {
        await processFiles(allFiles);
      }
    },
    [processFiles]
  );

  /** 文件选择器处理 */
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (!files.length) return;
      const fileList = files.map((f) => ({
        file: f,
        relativePath: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
      }));
      await processFiles(fileList);
      e.target.value = "";
    },
    [processFiles]
  );

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const uploadingCount = tasks.filter((t) => t.status === "uploading").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const errorCount = tasks.filter((t) => t.status === "error").length;
  const totalCount = tasks.length;
  const overallProgress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <div className="flex flex-col h-full">
      {/* 拖拽区域 */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
          isDragOver
            ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
            : "border-border hover:border-primary/40 hover:bg-accent/20"
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center gap-3">
          <div className={`p-3 rounded-full ${isDragOver ? "bg-primary/20" : "bg-muted"}`}>
            <Upload className={`w-6 h-6 ${isDragOver ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <div>
            <p className="font-medium text-foreground">
              {isDragOver ? "释放以上传" : "拖拽文件或文件夹到此处"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              支持拖拽整个文件夹，自动保留目录结构
            </p>
          </div>
          <div className="flex gap-2 mt-1">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-border"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <FileUp className="w-3.5 h-3.5" />
              选择文件
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-border"
              onClick={() => folderInputRef.current?.click()}
              disabled={isUploading}
            >
              <FolderUp className="w-3.5 h-3.5" />
              选择文件夹
            </Button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-ignore
          webkitdirectory=""
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* 上传进度汇总 */}
      {totalCount > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm">
              {isUploading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
              <span className="text-foreground font-medium">
                {isUploading ? "上传中..." : "上传完成"}
              </span>
              <div className="flex gap-1.5">
                {doneCount > 0 && (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                    {doneCount} 成功
                  </Badge>
                )}
                {errorCount > 0 && (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                    {errorCount} 失败
                  </Badge>
                )}
                {(pendingCount + uploadingCount) > 0 && (
                  <Badge variant="outline" className="text-xs border-border">
                    {pendingCount + uploadingCount} 待上传
                  </Badge>
                )}
              </div>
            </div>
            <span className="text-sm text-muted-foreground">{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-1.5 bg-muted" />
        </div>
      )}

      {/* 任务列表 */}
      {tasks.length > 0 && (
        <div className="mt-4 flex-1 overflow-y-auto space-y-1.5 max-h-64">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/30 text-sm"
            >
              <div className="shrink-0">
                {task.status === "done" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                {task.status === "error" && <AlertCircle className="w-4 h-4 text-red-400" />}
                {task.status === "uploading" && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                {task.status === "pending" && <div className="w-4 h-4 rounded-full border border-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-foreground">{task.name}</p>
                {task.status === "uploading" && (
                  <Progress value={task.progress} className="h-1 mt-1 bg-muted" />
                )}
                {task.status === "error" && (
                  <p className="text-xs text-red-400 truncate">{task.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end mt-4 pt-4 border-t border-border">
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="border-border"
          disabled={isUploading}
        >
          {isUploading ? "上传中，请稍候..." : "关闭"}
        </Button>
      </div>
    </div>
  );
}
