"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const FaceGroups = dynamic(
  () => import("@/components/album/FaceGroups"),
  { loading: () => <Skeleton className="h-64 rounded-lg" /> }
);
const FaceGroupPhotos = dynamic(
  () => import("@/components/album/FaceGroupPhotos"),
  { loading: () => <Skeleton className="h-64 rounded-lg" /> }
);

export function FaceGroupsViewContent() {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(null);

  if (selectedGroupId) {
    return (
      <FaceGroupPhotos
        groupId={selectedGroupId}
        groupName={selectedGroupName}
        onBack={() => {
          setSelectedGroupId(null);
          setSelectedGroupName(null);
        }}
      />
    );
  }

  return (
    <FaceGroups
      onSelectGroup={(groupId, groupName) => {
        setSelectedGroupId(groupId);
        setSelectedGroupName(groupName);
      }}
    />
  );
}
