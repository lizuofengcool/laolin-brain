"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const TimelineView = dynamic(
  () => import("@/components/timeline/TimelineView").then((m) => ({ default: m.TimelineView })),
  { loading: () => <Skeleton className="h-64 rounded-lg" /> }
);

export function TimelineViewContent() {
  return <TimelineView />;
}
