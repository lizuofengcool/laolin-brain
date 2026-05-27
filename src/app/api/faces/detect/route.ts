import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { detectFaces } from '@/lib/ai/face-detection';
import { cosineSimilarity } from '@/lib/face-cluster';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = await request.json();
    const { imageBase64, fileId } = body;

    if (!imageBase64 || !fileId) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // Verify file belongs to authenticated user
    const file = await db.file.findUnique({ where: { id: fileId } });
    if (!file || file.userId !== userId) {
      return NextResponse.json(
        { error: '文件不存在或无权访问' },
        { status: 403 }
      );
    }

    // Check if faces already detected for this file
    const existingFaces = await db.faceInstance.findMany({
      where: { fileId },
    });

    if (existingFaces.length > 0) {
      // Get the group info for existing faces
      const groups = await db.faceGroup.findMany({
        where: {
          userId,
          faces: { some: { fileId } },
        },
        include: { faces: true },
      });

      return NextResponse.json({
        message: '该图片已检测过人脸',
        faces: existingFaces.map((f) => ({
          id: f.id,
          groupId: f.groupId,
          fileId: f.fileId,
          description: f.description,
          bboxX: f.bboxX,
          bboxY: f.bboxY,
          bboxW: f.bboxW,
          bboxH: f.bboxH,
        })),
        groups: groups.map((g) => ({
          id: g.id,
          name: g.name,
          faceCount: g.faces.length,
          thumbnail: g.thumbnail,
        })),
      });
    }

    // Detect faces using AI
    const detections = await detectFaces(imageBase64);

    if (detections.length === 0) {
      return NextResponse.json({
        message: '未检测到人脸',
        faces: [],
        groups: [],
      });
    }

    // Get all existing face groups for this user
    const existingGroups = await db.faceGroup.findMany({
      where: { userId },
      include: { faces: true },
    });

    const results: Array<{ faceId: string; groupId: string; matched: boolean }> = [];
    let newGroupsCreated = 0;

    for (const detection of detections) {
      const faceInstance = {
        fileId,
        embedding: JSON.stringify(detection.embedding),
        description: detection.description,
        bboxX: detection.x,
        bboxY: detection.y,
        bboxW: detection.width,
        bboxH: detection.height,
      };

      // Try to find a matching existing cluster
      let assignedGroupId: string | null = null;

      // Check against existing DB groups
      for (const group of existingGroups) {
        if (group.faces.length === 0) continue;

        // Compare with all faces in the group
        let maxSim = 0;
        for (const groupFace of group.faces) {
          let groupEmbedding: number[] = [];
          try {
            groupEmbedding = JSON.parse(groupFace.embedding);
          } catch {
            continue;
          }
          const sim = cosineSimilarity(detection.embedding, groupEmbedding);
          if (sim > maxSim) maxSim = sim;
        }

        if (maxSim >= 0.75) {
          assignedGroupId = group.id;
          break;
        }
      }

      if (assignedGroupId) {
        // Add to existing group
        await db.faceInstance.create({
          data: {
            ...faceInstance,
            groupId: assignedGroupId,
          },
        });
        results.push({
          faceId: detection.id,
          groupId: assignedGroupId,
          matched: true,
        });
      } else {
        // Create a new group
        const groupId = randomUUID();
        await db.faceGroup.create({
          data: {
            id: groupId,
            userId,
            name: null,
            thumbnail: fileId,
            faces: {
              create: {
                ...faceInstance,
              },
            },
          },
        });
        results.push({
          faceId: detection.id,
          groupId,
          matched: false,
        });
        newGroupsCreated++;
      }
    }

    return NextResponse.json({
      message: `检测到 ${detections.length} 张人脸，新建 ${newGroupsCreated} 个分组`,
      faces: detections.map((d, i) => ({
        id: results[i]?.faceId || d.id,
        groupId: results[i]?.groupId,
        fileId,
        description: d.description,
        bboxX: d.x,
        bboxY: d.y,
        bboxW: d.width,
        bboxH: d.height,
      })),
    });
  } catch (e) {
    console.error('Face detection API error:', e);
    return NextResponse.json(
      { error: '人脸检测失败' },
      { status: 500 }
    );
  }
}
