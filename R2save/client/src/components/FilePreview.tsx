import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatSize, formatDate, getFileCategory } from "@/lib/r2Types";
import { FileIcon } from "./FileIcon";
import { Download, X, ExternalLink } from "lucide-react";

interface FilePreviewProps {
  open: boolean;
  onClose: () => void;
  file: {
    key: string;
    name: string;
    size: number;
    lastModified: string;
    contentType?: string;
  } | null;
  bucket: string;
  onDownload: (key: string, name: string) => void;
}

export function FilePreview({ open, onClose, file, bucket, onDownload }: FilePreviewProps) {
  if (!file) return null;

  const proxyUrl = `/api/r2-proxy/${bucket}/${file.key}`;
  const category = getFileCategory(file.name, file.contentType);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl bg-card border-border text-foreground p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold truncate pr-4">
              <FileIcon name={file.name} contentType={file.contentType} className="w-5 h-5 shrink-0" />
              <span className="truncate">{file.name}</span>
            </DialogTitle>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-border h-8"
                onClick={() => onDownload(file.key, file.name)}
              >
                <Download className="w-3.5 h-3.5" />
                下载
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col">
          {/* 预览区域 */}
          <div className="flex-1 min-h-0 bg-black/20">
            {category === "image" ? (
              <div className="flex items-center justify-center p-4 max-h-[60vh]">
                <img
                  src={proxyUrl}
                  alt={file.name}
                  className="max-w-full max-h-[55vh] object-contain rounded"
                  loading="lazy"
                />
              </div>
            ) : category === "video" ? (
              <div className="p-4">
                <video
                  src={proxyUrl}
                  controls
                  className="w-full max-h-[55vh] rounded"
                >
                  您的浏览器不支持视频预览
                </video>
              </div>
            ) : category === "audio" ? (
              <div className="p-6 flex flex-col items-center gap-4">
                <FileIcon name={file.name} contentType={file.contentType} className="w-16 h-16" />
                <audio src={proxyUrl} controls className="w-full max-w-md">
                  您的浏览器不支持音频预览
                </audio>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <FileIcon name={file.name} contentType={file.contentType} className="w-16 h-16 opacity-60" />
                <p className="text-muted-foreground text-sm">此文件类型不支持内联预览</p>
                <a
                  href={proxyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline text-sm flex items-center gap-1"
                >
                  在新标签页中打开 <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>

          {/* 文件信息 */}
          <div className="px-6 py-4 border-t border-border bg-muted/20">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs mb-1">文件大小</p>
                <p className="font-medium">{formatSize(file.size)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">修改时间</p>
                <p className="font-medium">{formatDate(file.lastModified)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">文件类型</p>
                <Badge variant="outline" className="text-xs border-border">
                  {file.contentType || getFileCategory(file.name)}
                </Badge>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-muted-foreground text-xs mb-1">对象键</p>
              <p className="font-mono text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded truncate">
                {file.key}
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
