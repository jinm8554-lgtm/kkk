import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";

interface DeleteConfirmProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  count: number;
  names?: string[];
}

export function DeleteConfirm({ open, onConfirm, onCancel, count, names }: DeleteConfirmProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="bg-card border-border text-foreground">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-destructive" />
            确认删除
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {count === 1 ? (
              <>
                确定要删除文件{" "}
                <span className="text-foreground font-medium">{names?.[0]}</span> 吗？
              </>
            ) : (
              <>
                确定要删除选中的{" "}
                <span className="text-destructive font-medium">{count}</span> 个文件吗？
              </>
            )}
            <br />
            <span className="text-destructive/80 text-xs mt-1 block">此操作不可撤销。</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={onCancel}
            className="border-border bg-transparent hover:bg-accent"
          >
            取消
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive hover:bg-destructive/90 text-white"
          >
            确认删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
