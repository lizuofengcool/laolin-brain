import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { detectFaces, type FaceDetection } from '@/lib/ai/face-detection';
import { randomUUID } from 'crypto';
import { cosineSimilarity } from '@/lib/face-cluster';

// Track processing state in memory
const processingState = new Map<string, { processed: number; total: number; isProcessing: boolean }>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: '缺少用户ID' },
        { status: 400 }
      );
    }

    // Check if already processing
    const state = processingState.get(userId);
    if (state?.isProcessing) {
      return NextResponse.json({
        message: '正在处理中...',
        processed: state.processed,
        total: state.total,
        isProcessing: true,
      });
    }

    // Find all image files that haven't been face-detected yet
    const allImageFiles = await db.file.findMany({
      where: {
        userId,
        fileType: 'image',
        isDeleted: false,
        storageMode: 'cloud',
        filePath: { not: null },
      },
      select: { id: true, filePath: true },
    });

    // Find files that already have face detections
    const filesWithFaces = await db.faceInstance.findMany({
      where: { fileId: { in: allImageFiles.map((f) => f.id) } },
      select: { fileId: true },
    });

    const filesWithFacesSet = new Set(filesWithFaces.map((f) => f.fileId));
    const unprocessedFiles = allImageFiles.filter((f) => !filesWithFacesSet.has(f.id));

    if (unprocessedFiles.length === 0) {
      return NextResponse.json({
        message: '所有图片已处理完毕',
        processed: 0,
        total: 0,
        isProcessing: false,
      });
    }

    // Start processing in background
    const total = unprocessedFiles.length;
    processingState.set(userId, { processed: 0, total, isProcessing: true });

    // Process asynchronously
    processFilesInBackground(userId, unprocessedFiles);

    return NextResponse.json({
      message: `开始处理 ${total} 张图片`,
      processed: 0,
      total,
      isProcessing: true,
    });
  } catch (e) {
    console.error('Process all error:', e);
    return NextResponse.json(
      { error: '处理失败' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ isProcessing: false, processed: 0, total: 0 });
    }

    const state = processingState.get(userId);
    if (!state) {
      return NextResponse.json({ isProcessing: false, processed: 0, total: 0 });
    }

    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ isProcessing: false, processed: 0, total: 0 });
  }
}

async function processFilesInBackground(
  userId: string,
  files: { id: string; filePath: string | null }[]
) {
  const state = processingState.get(userId);
  if (!state) return;

  // Import face detection
  let detectFn: (base64: string) => Promise<FaceDetection[]>;
  try {
    const detectionModule = await import('@/lib/ai/face-detection');
    detectFn = detectionModule.detectFaces;
  } catch {
    state.isProcessing = false;
    return;
  }

  // Process in batches of 3
  const batchSize = 3;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (file) => {
        try {
          if (!file.filePath) {
            state.processed++;
            return;
          }

          // Read file from disk and convert to base64
          const fs = await import('fs');
          const path = await import('path');
          const fullPath = path.join(process.cwd(), 'uploads', file.filePath.replace('/uploads/', ''));

          if (!fs.existsSync(fullPath)) {
            state.processed++;
            return;
          }

          const buffer = fs.readFileSync(fullPath);
          const base64 = buffer.toString('base64');

          // Detect faces
          const detections = await detectFn(base64);

          if (detections.length === 0) {
            state.processed++;
            return;
          }

          // Get existing groups for this user
          const existingGroups = await db.faceGroup.findMany({
            where: { userId },
            include: { faces: true },
          });

          for (const detection of detections) {
            let assignedGroupId: string | null = null;

            // Try to match with existing group
            for (const group of existingGroups) {
              if (group.faces.length === 0) continue;

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
              await db.faceInstance.create({
                data: {
                  groupId: assignedGroupId,
                  fileId: file.id,
                  embedding: JSON.stringify(detection.embedding),
                  description: detection.description,
                  bboxX: detection.x,
                  bboxY: detection.y,
                  bboxW: detection.width,
                  bboxH: detection.height,
                },
              });
            } else {
              // Create new group
              const groupId = randomUUID();
              await db.faceGroup.create({
                data: {
                  id: groupId,
                  userId,
                  name: null,
                  thumbnail: file.id,
                  faces: {
                    create: {
                      fileId: file.id,
                      embedding: JSON.stringify(detection.embedding),
                      description: detection.description,
                      bboxX: detection.x,
                      bboxY: detection.y,
                      bboxW: detection.width,
                      bboxH: detection.height,
                    },
                  },
                },
              });
              existingGroups.push({
                id: groupId,
                userId,
                name: null,
                thumbnail: file.id,
                createdAt: new Date(),
                updatedAt: new Date(),
                faces: [{
                  id: 'temp',
                  groupId,
                  fileId: file.id,
                  embedding: JSON.stringify(detection.embedding),
                  description: detection.description,
                  bboxX: detection.x,
                  bboxY: detection.y,
                  bboxW: detection.width,
                  bboxH: detection.height,
                  createdAt: new Date(),
                }],
              });
            }
          }

          state.processed++;
        } catch (err) {
          console.error(`Error processing file ${file.id}:`, err);
          state.processed++;
        }
      })
    );

    // Small delay between batches to avoid rate limits
    if (i + batchSize < files.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  state.isProcessing = false;
}
