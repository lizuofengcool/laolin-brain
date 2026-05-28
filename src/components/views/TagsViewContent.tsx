"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const TagManagement = dynamic(
  () => import("@/components/tags/TagManagement"),
  { loading: () => <Skeleton className="h-64 rounded-lg" /> }
);

export function TagsViewContent() {
  return <TagManagement />;
}
