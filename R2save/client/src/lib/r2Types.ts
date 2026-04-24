/**
 * R2 Manager 共享类型定义
 */

export interface R2FileItem {
  key: string;
  name: string;
  size: number;
  lastModified: string;
  etag: string;
  contentType: string;
  isFolder: false;
}

export interface R2FolderItem {
  key: string;
  name: string;
  isFolder: true;
}

export type R2Item = R2FileItem | R2FolderItem;

export type SortField = "name" | "size" | "lastModified" | "type";
export type SortOrder = "asc" | "desc";
export type ViewMode = "table" | "grid";

export interface BucketInfo {
  name: string;
  creationDate: string;
}

/** 文件类型分类 */
export function getFileCategory(name: string, contentType?: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const ct = contentType?.toLowerCase() ?? "";

  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "avif"].includes(ext) || ct.startsWith("image/")) {
    return "image";
  }
  if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext) || ct.startsWith("video/")) {
    return "video";
  }
  if (["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(ext) || ct.startsWith("audio/")) {
    return "audio";
  }
  if (["pdf"].includes(ext) || ct === "application/pdf") {
    return "pdf";
  }
  if (["zip", "tar", "gz", "rar", "7z", "bz2"].includes(ext)) {
    return "archive";
  }
  if (["js", "ts", "jsx", "tsx", "py", "go", "rs", "java", "c", "cpp", "h", "css", "html", "json", "yaml", "yml", "toml", "sh", "bash", "sql"].includes(ext)) {
    return "code";
  }
  if (["txt", "md", "log", "csv", "xml"].includes(ext) || ct.startsWith("text/")) {
    return "text";
  }
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext)) {
    return "office";
  }
  return "file";
}

/** 格式化文件大小 */
export function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** 格式化日期 */
export function formatDate(iso: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 获取 MIME 类型 */
export function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
    pdf: "application/pdf",
    zip: "application/zip", tar: "application/x-tar",
    gz: "application/gzip", rar: "application/x-rar-compressed",
    json: "application/json", xml: "application/xml",
    txt: "text/plain", md: "text/markdown", csv: "text/csv",
    html: "text/html", css: "text/css",
    js: "application/javascript", ts: "application/typescript",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return mimeMap[ext] ?? "application/octet-stream";
}
