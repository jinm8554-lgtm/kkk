import { useState, useCallback } from "react";
import JSZip from "jszip";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export interface DownloadProgress {
  active: boolean;
  label: string;
  current: number;
  total: number;
  percent: number;
}

const CONCURRENCY = 4;

// ============================================================================
// File System Access API 工具
// ----------------------------------------------------------------------------
// 在支持该 API 的浏览器（Chromium 内核 + 安全上下文 https:// 或 localhost）中，
// 所有下载函数都会先弹出原生"另存为"对话框让用户选择保存位置，然后再开始真正
// 的网络请求和流式写入。对于不支持的浏览器（Firefox / Safari），所有函数会
// 自动降级为先把数据读入内存、再通过 <a download> 触发默认下载目录保存。
// ============================================================================

type SaveFilePickerAcceptType = {
  description?: string;
  accept: Record<string, string[]>;
};

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: SaveFilePickerAcceptType[];
}

interface FileSystemWritableFileStreamLike {
  write(data: ArrayBuffer | ArrayBufferView | Blob | string): Promise<void>;
  close(): Promise<void>;
  abort?(reason?: unknown): Promise<void>;
}

interface FileSystemFileHandleLike {
  createWritable(): Promise<FileSystemWritableFileStreamLike>;
}

function supportsFilePicker(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === "function"
  );
}

/** 根据文件名猜测 accept MIME 类型，便于原生对话框过滤 */
function guessAcceptFromName(name: string): SaveFilePickerAcceptType[] | undefined {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return undefined;
  const ext = name.slice(dot).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".zip": "application/zip",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".txt": "text/plain",
    ".json": "application/json",
    ".csv": "text/csv",
  };
  const mime = mimeMap[ext] ?? "application/octet-stream";
  return [{ description: "文件", accept: { [mime]: [ext] } }];
}

/**
 * 弹出"另存为"对话框（单文件用）。
 * - 浏览器支持：返回 FileSystemFileHandle
 * - 浏览器不支持：返回 null（交由上层降级处理）
 * - 用户取消：抛出 AbortError（上层需捕获并直接返回，不发起任何网络请求）
 */
async function pickSaveLocation(
  suggestedName: string
): Promise<FileSystemFileHandleLike | null> {
  if (!supportsFilePicker()) return null;
  const showSaveFilePicker = (
    window as unknown as {
      showSaveFilePicker: (opts?: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>;
    }
  ).showSaveFilePicker;
  return await showSaveFilePicker({
    suggestedName,
    types: guessAcceptFromName(suggestedName),
  });
}

/** 判断错误是否为用户主动取消"另存为"对话框 */
function isUserAbort(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  return name === "AbortError" || name === "NotAllowedError";
}

/** 将 Response 流式写入一个 FileSystemWritableFileStream，并上报进度 */
async function streamToFileHandle(
  response: Response,
  handle: FileSystemFileHandleLike,
  onProgress?: (received: number, total: number) => void
): Promise<void> {
  if (!response.body) {
    // 无流可用时直接写入 blob（极少数情况）
    const blob = await response.blob();
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
    } finally {
      await writable.close();
    }
    return;
  }

  const totalHeader = response.headers.get("Content-Length");
  const total = totalHeader ? parseInt(totalHeader, 10) : 0;
  const writable = await handle.createWritable();
  const reader = response.body.getReader();
  let received = 0;
  try {
    // 持续读取数据块，实时写入本地文件
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        await writable.write(value);
        received += value.byteLength;
        onProgress?.(received, total);
      }
    }
    await writable.close();
  } catch (err) {
    try {
      await writable.abort?.(err);
    } catch {
      // ignore
    }
    throw err;
  }
}

/** 降级：Blob + <a download> 写入默认下载目录 */
async function downloadByAnchor(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** 批量下载/文件夹下载/混合下载时的一个条目（文件或需要递归展开的文件夹） */
export interface StreamDownloadEntry {
  /** 是否是文件夹（需要递归列出内部文件） */
  isFolder: boolean;
  /** 文件的 key，或文件夹的 prefix（以 "/" 结尾） */
  key: string;
  /** 在 ZIP 内或保存对话框中展示的名称 */
  name: string;
}

export function useDownload(bucket: string) {
  const [progress, setProgress] = useState<DownloadProgress>({
    active: false,
    label: "",
    current: 0,
    total: 0,
    percent: 0,
  });

  const utils = trpc.useUtils();

  const reset = () =>
    setProgress({ active: false, label: "", current: 0, total: 0, percent: 0 });

  // ─────────────────────────────────────────────────────────────────────────
  // 单文件下载：先弹出"另存为"对话框 → 再流式拉取 → 实时写入用户选择的位置
  // ─────────────────────────────────────────────────────────────────────────
  const downloadSingle = useCallback(
    async (key: string, filename: string) => {
      const url = `/api/r2-proxy/${bucket}/${encodeURI(key)}`;

      // 1. 先弹出"另存为"对话框（必须在用户手势同步栈内）
      let handle: FileSystemFileHandleLike | null = null;
      if (supportsFilePicker()) {
        try {
          handle = await pickSaveLocation(filename);
        } catch (err) {
          if (isUserAbort(err)) return;
          console.warn("[useDownload] showSaveFilePicker failed, fallback to anchor:", err);
          handle = null;
        }
      }

      setProgress({
        active: true,
        label: `下载 ${filename}`,
        current: 0,
        total: 1,
        percent: 0,
      });

      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        if (handle) {
          await streamToFileHandle(res, handle, (received, total) => {
            const pct = total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0;
            setProgress({
              active: true,
              label: `下载 ${filename}`,
              current: received,
              total: total || received,
              percent: pct,
            });
          });
        } else {
          const blob = await res.blob();
          await downloadByAnchor(blob, filename);
        }

        setProgress({
          active: true,
          label: `下载 ${filename}`,
          current: 1,
          total: 1,
          percent: 100,
        });
        setTimeout(reset, 1500);
      } catch (err) {
        toast.error(`下载失败：${err instanceof Error ? err.message : String(err)}`);
        reset();
      }
    },
    [bucket]
  );

  /**
   * 递归展开一组条目（文件夹会被展开成其下的所有文件，文件保持原样），
   * 返回每个文件在 ZIP 包内的相对路径。
   */
  const expandEntriesToFiles = useCallback(
    async (entries: StreamDownloadEntry[]): Promise<Array<{ key: string; relativePath: string }>> => {
      const result: Array<{ key: string; relativePath: string }> = [];
      for (const entry of entries) {
        if (!entry.isFolder) {
          result.push({ key: entry.key, relativePath: entry.name });
          continue;
        }
        // 文件夹：递归列出所有文件，并把路径改写成 "${folderName}/${相对路径}"
        // 保证下载出来的 ZIP 里文件夹结构清晰。
        const folderPrefix = entry.key.endsWith("/") ? entry.key : `${entry.key}/`;
        let continuationToken: string | undefined;
        do {
          const listResult = await utils.r2.listObjects.fetch({
            bucket,
            prefix: folderPrefix,
            recursive: true,
            continuationToken,
            maxKeys: 1000,
          });
          for (const file of listResult.files) {
            const rel = file.key.startsWith(folderPrefix)
              ? file.key.slice(folderPrefix.length)
              : file.key;
            result.push({
              key: file.key,
              relativePath: `${entry.name}/${rel}`,
            });
          }
          continuationToken = listResult.nextContinuationToken;
        } while (continuationToken);
      }
      return result;
    },
    [bucket, utils]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 批量流式下载（混合文件/文件夹）：点击立即弹出"另存为"对话框让用户
  // 选 ZIP 的保存位置，然后再递归展开、拉取并流式写入磁盘。
  // ─────────────────────────────────────────────────────────────────────────
  const downloadStreamSelected = useCallback(
    async (entries: StreamDownloadEntry[], zipBaseName: string = "download") => {
      if (!entries.length) {
        toast.error("请先选择要下载的文件或文件夹");
        return;
      }

      // 单个文件的特例：直接走 downloadSingle，体验最好（不打 ZIP）
      if (entries.length === 1 && !entries[0].isFolder) {
        await downloadSingle(entries[0].key, entries[0].name);
        return;
      }

      const dateTag = new Date().toISOString().slice(0, 10);
      const suggestedName =
        entries.length === 1
          ? `${entries[0].name}-${dateTag}.zip`
          : `${zipBaseName}-${dateTag}.zip`;

      // 1. 先弹出"另存为"对话框（点击后同步调用）
      let handle: FileSystemFileHandleLike | null = null;
      if (supportsFilePicker()) {
        try {
          handle = await pickSaveLocation(suggestedName);
        } catch (err) {
          if (isUserAbort(err)) return;
          console.warn("[useDownload] showSaveFilePicker failed, fallback to anchor:", err);
          handle = null;
        }
      }

      setProgress({
        active: true,
        label: "展开所选内容...",
        current: 0,
        total: 0,
        percent: 3,
      });

      try {
        // 2. 展开文件夹为文件列表（递归）
        const files = await expandEntriesToFiles(entries);
        if (!files.length) {
          toast.error("所选内容中没有文件");
          reset();
          return;
        }

        setProgress({
          active: true,
          label: `共 ${files.length} 个文件，开始下载...`,
          current: 0,
          total: files.length,
          percent: 8,
        });

        // 3. 并发拉取文件并放入 zip（内容暂存于内存 ZIP 对象）
        const zip = new JSZip();
        let done = 0;
        let failed = 0;

        const chunks: (typeof files)[] = [];
        for (let i = 0; i < files.length; i += CONCURRENCY) {
          chunks.push(files.slice(i, i + CONCURRENCY));
        }

        for (const chunk of chunks) {
          await Promise.allSettled(
            chunk.map(async ({ key, relativePath }) => {
              try {
                const url = `/api/r2-proxy/${bucket}/${encodeURI(key)}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const blob = await res.blob();
                zip.file(relativePath, blob);
                done++;
              } catch {
                failed++;
                done++;
              }
              const pct = 8 + Math.round((done / files.length) * 82);
              setProgress({
                active: true,
                label: `下载中 ${done}/${files.length}...`,
                current: done,
                total: files.length,
                percent: pct,
              });
            })
          );
        }

        // 4. 生成 ZIP 并写入用户选择的位置（支持时真正流式落盘）
        setProgress((p) => ({ ...p, label: "生成 ZIP...", percent: 92 }));

        if (handle) {
          const writable = await handle.createWritable();
          try {
            await new Promise<void>((resolve, reject) => {
              zip
                .generateInternalStream({ type: "uint8array", compression: "STORE" })
                .on("data", (chunk: Uint8Array) => {
                  void writable.write(chunk);
                })
                .on("error", reject)
                .on("end", () => resolve())
                .resume();
            });
            await writable.close();
          } catch (err) {
            try {
              await writable.abort?.(err);
            } catch {
              // ignore
            }
            throw err;
          }
        } else {
          const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
          await downloadByAnchor(blob, suggestedName);
        }

        setProgress({
          active: true,
          label: "完成",
          current: files.length,
          total: files.length,
          percent: 100,
        });

        if (failed > 0) {
          toast.warning(`下载完成，${files.length - failed} 成功，${failed} 失败`);
        } else {
          toast.success(`已下载 ${files.length} 个文件`);
        }
      } catch (err) {
        toast.error(`下载失败：${err instanceof Error ? err.message : String(err)}`);
      }
      setTimeout(reset, 2000);
    },
    [bucket, downloadSingle, expandEntriesToFiles]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 批量直下（逐文件、不打 ZIP）：
  //   - 首选使用 File System Access API：showDirectoryPicker 让用户选一个本地
  //     目标目录，然后递归展开、为每个文件在目录内按原相对路径创建子目录并
  //     流式写入磁盘（保留文件夹结构）
  //   - 浏览器不支持 showDirectoryPicker（如 Firefox/Safari）时，回退到逐文件
  //     `<a download>` 触发浏览器默认下载目录，但此时会把路径分隔符替换成
  //     下划线，避免非法文件名
  // ─────────────────────────────────────────────────────────────────────────
  const downloadDirectToFolder = useCallback(
    async (entries: StreamDownloadEntry[]) => {
      if (!entries.length) {
        toast.error("请先选择要下载的文件或文件夹");
        return;
      }

      // 1. 先尝试让用户选择本地目标目录（必须在用户手势同步栈内）
      type FsDirHandle = {
        getDirectoryHandle(
          name: string,
          opts?: { create?: boolean },
        ): Promise<FsDirHandle>;
        getFileHandle(
          name: string,
          opts?: { create?: boolean },
        ): Promise<FileSystemFileHandleLike>;
      };
      const supportsDirPicker =
        typeof window !== "undefined" &&
        typeof (window as unknown as { showDirectoryPicker?: unknown })
          .showDirectoryPicker === "function";

      let dirHandle: FsDirHandle | null = null;
      if (supportsDirPicker) {
        try {
          dirHandle = await (
            window as unknown as {
              showDirectoryPicker: (opts?: {
                mode?: "read" | "readwrite";
              }) => Promise<FsDirHandle>;
            }
          ).showDirectoryPicker({ mode: "readwrite" });
        } catch (err) {
          if (isUserAbort(err)) return;
          console.warn(
            "[useDownload] showDirectoryPicker failed, fallback to anchor:",
            err,
          );
          dirHandle = null;
        }
      }

      setProgress({
        active: true,
        label: "展开所选内容...",
        current: 0,
        total: 0,
        percent: 3,
      });

      try {
        // 2. 递归展开，得到一份 {key, relativePath} 列表
        const files = await expandEntriesToFiles(entries);
        if (!files.length) {
          toast.error("所选内容中没有文件");
          reset();
          return;
        }

        setProgress({
          active: true,
          label: `共 ${files.length} 个文件，开始直下...`,
          current: 0,
          total: files.length,
          percent: 5,
        });

        // 工具：按相对路径在选定目录下逐级 getDirectoryHandle(create:true)
        const ensureFileHandleByRelPath = async (
          root: FsDirHandle,
          relPath: string,
        ): Promise<FileSystemFileHandleLike> => {
          const parts = relPath.split("/").filter(Boolean);
          const fileName = parts.pop() ?? relPath;
          let cur: FsDirHandle = root;
          for (const seg of parts) {
            // Windows/非法字符简单替换，避免 createDirectoryHandle 失败
            const safeSeg = seg.replace(/[\\/:*?"<>|]/g, "_");
            cur = await cur.getDirectoryHandle(safeSeg, { create: true });
          }
          const safeName = fileName.replace(/[\\/:*?"<>|]/g, "_");
          return await cur.getFileHandle(safeName, { create: true });
        };

        let done = 0;
        let failed = 0;

        // 3. 为避免浏览器被成百上千个并发 fetch 压垮，使用固定并发池
        const chunks: (typeof files)[] = [];
        for (let i = 0; i < files.length; i += CONCURRENCY) {
          chunks.push(files.slice(i, i + CONCURRENCY));
        }

        for (const chunk of chunks) {
          await Promise.allSettled(
            chunk.map(async ({ key, relativePath }) => {
              try {
                const url = `/api/r2-proxy/${bucket}/${encodeURI(key)}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                if (dirHandle) {
                  // 支持 File System Access：按相对路径建子目录 + 流式写文件
                  const fileHandle = await ensureFileHandleByRelPath(
                    dirHandle,
                    relativePath,
                  );
                  await streamToFileHandle(res, fileHandle);
                } else {
                  // 回退：浏览器默认下载目录，文件名把 "/" 替换成 "_"
                  const blob = await res.blob();
                  const flatName = relativePath.replace(/\//g, "_");
                  await downloadByAnchor(blob, flatName);
                }
                done++;
              } catch (err) {
                console.warn("[useDownload] file failed:", relativePath, err);
                failed++;
                done++;
              }
              const pct = 5 + Math.round((done / files.length) * 93);
              setProgress({
                active: true,
                label: `直下中 ${done}/${files.length}...`,
                current: done,
                total: files.length,
                percent: pct,
              });
            }),
          );
        }

        setProgress({
          active: true,
          label: "完成",
          current: files.length,
          total: files.length,
          percent: 100,
        });

        const ok = files.length - failed;
        if (failed > 0) {
          toast.warning(`直下完成：成功 ${ok}，失败 ${failed}`);
        } else if (!dirHandle) {
          toast.success(
            `已触发 ${files.length} 个文件下载（浏览器不支持选目录，已保存到默认下载目录，文件名已把 / 替换为 _）`,
          );
        } else {
          toast.success(`已直接保存 ${files.length} 个文件到所选目录`);
        }
      } catch (err) {
        toast.error(
          `批量直下失败：${err instanceof Error ? err.message : String(err)}`,
        );
      }
      setTimeout(reset, 2000);
    },
    [bucket, expandEntriesToFiles],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 为了向后兼容保留原有两个 API：它们内部复用 downloadStreamSelected。
  // ─────────────────────────────────────────────────────────────────────────

  /** 批量下载（旧 API，只处理文件） */
  const downloadBatch = useCallback(
    async (files: Array<{ key: string; name: string }>, zipName: string = "download") => {
      const entries: StreamDownloadEntry[] = files.map((f) => ({
        isFolder: false,
        key: f.key,
        name: f.name,
      }));
      await downloadStreamSelected(entries, zipName);
    },
    [downloadStreamSelected]
  );

  /** 下载整个文件夹（旧 API，与右键菜单一致） */
  const downloadFolder = useCallback(
    async (folderPrefix: string, folderName: string) => {
      await downloadStreamSelected(
        [{ isFolder: true, key: folderPrefix, name: folderName }],
        folderName
      );
    },
    [downloadStreamSelected]
  );

  return {
    progress,
    downloadSingle,
    downloadBatch,
    downloadFolder,
    /** 新 API：支持文件+文件夹混合打包下载，先弹出保存位置选择再开始 */
    downloadStreamSelected,
    /** 新 API：批量直下（逐文件，保留相对路径；Chrome/Edge 选一次目录即可） */
    downloadDirectToFolder,
  };
}
