"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const KnowledgeGraphView = dynamic(
  () => import("@/components/graph/KnowledgeGraph").then((m) => ({ default: m.KnowledgeGraphView })),
  { loading: () => <Skeleton className="h-64 rounded-lg" /> }
);

export function GraphViewContent() {
  return <KnowledgeGraphView />;
}
