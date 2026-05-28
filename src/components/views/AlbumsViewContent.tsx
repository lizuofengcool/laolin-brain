"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const AlbumView = dynamic(
  () => import("@/components/album/AlbumView"),
  { loading: () => <Skeleton className="h-64 rounded-lg" /> }
);

export function AlbumsViewContent() {
  return <AlbumView />;
}
