"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const AnalyticsDashboard = dynamic(
  () => import("@/components/dashboard/AnalyticsDashboard"),
  { loading: () => <Skeleton className="h-64 rounded-lg" /> }
);

export function AnalyticsViewContent() {
  return <AnalyticsDashboard />;
}
