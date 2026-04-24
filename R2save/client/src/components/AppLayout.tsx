import { useLocation } from "wouter";
import { useR2 } from "@/contexts/R2Context";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  Database,
  FolderOpen,
  Settings2,
  Zap,
  ChevronRight,
} from "lucide-react";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "概览", exact: true },
  { path: "/buckets", icon: Database, label: "存储桶" },
  { path: "/files", icon: FolderOpen, label: "文件浏览" },
  { path: "/settings", icon: Settings2, label: "凭证配置" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { currentBucket } = useR2();
  const { data: status } = trpc.r2.status.useQuery();

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return location === path;
    return location.startsWith(path);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* 侧边栏 */}
      <aside className="w-56 shrink-0 flex flex-col border-r border-sidebar-border bg-sidebar">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-sidebar-foreground leading-none">R2 Manager</p>
              <p className="text-xs text-muted-foreground mt-0.5">Cloudflare R2</p>
            </div>
          </div>
        </div>

        {/* 当前存储桶 */}
        {currentBucket && (
          <div className="px-3 py-3 border-b border-sidebar-border">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-primary/10">
              <Database className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-xs text-primary font-medium truncate">{currentBucket}</span>
            </div>
          </div>
        )}

        {/* 导航 */}
        <nav className="flex-1 px-3 py-3 space-y-1">
          {navItems.map((item) => {
            const active = isActive(item.path, item.exact);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon
                  className={`w-4 h-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground group-hover:text-sidebar-accent-foreground"}`}
                />
                <span className="flex-1 text-left">{item.label}</span>
                {active && <ChevronRight className="w-3.5 h-3.5 text-primary/60" />}
                {item.path === "/settings" && !status?.configured && (
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
                )}
              </button>
            );
          })}
        </nav>

        {/* 底部状态 */}
        <div className="px-4 py-4 border-t border-sidebar-border">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${status?.configured ? "bg-emerald-400" : "bg-red-400"}`}
            />
            <span className="text-xs text-muted-foreground">
              {status?.configured ? "凭证已配置" : "凭证未配置"}
            </span>
          </div>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto bg-background">
        {children}
      </main>
    </div>
  );
}
