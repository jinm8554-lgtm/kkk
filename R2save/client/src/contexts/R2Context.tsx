import React, { createContext, useContext, useState, useCallback } from "react";

interface R2State {
  currentBucket: string;
  currentPrefix: string;
  setCurrentBucket: (bucket: string) => void;
  setCurrentPrefix: (prefix: string) => void;
  navigateTo: (prefix: string) => void;
  navigateUp: () => void;
  breadcrumbs: Array<{ name: string; prefix: string }>;
}

const R2Context = createContext<R2State | null>(null);

export function R2Provider({ children }: { children: React.ReactNode }) {
  const [currentBucket, setCurrentBucketState] = useState<string>(() => {
    return localStorage.getItem("r2_current_bucket") ?? "";
  });
  const [currentPrefix, setCurrentPrefixState] = useState<string>("");

  const setCurrentBucket = useCallback((bucket: string) => {
    setCurrentBucketState(bucket);
    setCurrentPrefixState("");
    localStorage.setItem("r2_current_bucket", bucket);
  }, []);

  const setCurrentPrefix = useCallback((prefix: string) => {
    setCurrentPrefixState(prefix);
  }, []);

  const navigateTo = useCallback((prefix: string) => {
    setCurrentPrefixState(prefix);
  }, []);

  const navigateUp = useCallback(() => {
    if (!currentPrefix) return;
    // 去掉末尾斜杠，然后找上一个斜杠
    const trimmed = currentPrefix.replace(/\/$/, "");
    const lastSlash = trimmed.lastIndexOf("/");
    if (lastSlash <= 0) {
      setCurrentPrefixState("");
    } else {
      setCurrentPrefixState(trimmed.substring(0, lastSlash + 1));
    }
  }, [currentPrefix]);

  // 生成面包屑
  const breadcrumbs = React.useMemo(() => {
    const crumbs: Array<{ name: string; prefix: string }> = [
      { name: currentBucket || "根目录", prefix: "" },
    ];
    if (!currentPrefix) return crumbs;

    const parts = currentPrefix.replace(/\/$/, "").split("/");
    let accumulated = "";
    for (const part of parts) {
      if (!part) continue;
      accumulated += part + "/";
      crumbs.push({ name: part, prefix: accumulated });
    }
    return crumbs;
  }, [currentBucket, currentPrefix]);

  return (
    <R2Context.Provider
      value={{
        currentBucket,
        currentPrefix,
        setCurrentBucket,
        setCurrentPrefix,
        navigateTo,
        navigateUp,
        breadcrumbs,
      }}
    >
      {children}
    </R2Context.Provider>
  );
}

export function useR2() {
  const ctx = useContext(R2Context);
  if (!ctx) throw new Error("useR2 must be used within R2Provider");
  return ctx;
}
