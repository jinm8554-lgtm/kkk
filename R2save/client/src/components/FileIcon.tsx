import {
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  FileCode,
  FileArchive,
  FileSpreadsheet,
  File,
  Folder,
} from "lucide-react";
import { getFileCategory } from "@/lib/r2Types";

interface FileIconProps {
  name: string;
  isFolder?: boolean;
  contentType?: string;
  className?: string;
}

export function FileIcon({ name, isFolder, contentType, className = "w-5 h-5" }: FileIconProps) {
  if (isFolder) {
    return <Folder className={`${className} text-yellow-400`} />;
  }

  const category = getFileCategory(name, contentType);

  switch (category) {
    case "image":
      return <FileImage className={`${className} text-pink-400`} />;
    case "video":
      return <FileVideo className={`${className} text-purple-400`} />;
    case "audio":
      return <FileAudio className={`${className} text-blue-400`} />;
    case "pdf":
      return <File className={`${className} text-red-400`} />;
    case "archive":
      return <FileArchive className={`${className} text-orange-400`} />;
    case "code":
      return <FileCode className={`${className} text-green-400`} />;
    case "text":
      return <FileText className={`${className} text-gray-400`} />;
    case "office":
      return <FileSpreadsheet className={`${className} text-emerald-400`} />;
    default:
      return <File className={`${className} text-muted-foreground`} />;
  }
}
