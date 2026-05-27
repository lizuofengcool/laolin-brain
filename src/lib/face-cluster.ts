/**
 * Face Clustering Engine
 * Uses cosine similarity + hierarchical clustering to group similar faces together.
 */

import { cosineSimilarity } from '@/lib/math-utils';

export interface FaceInstance {
  fileId: string;
  faceId: string;
  embedding: number[];
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceCluster {
  id: string;
  name: string | null;
  representativeFace: string;
  faceInstances: FaceInstance[];
  thumbnailFileId?: string;
}

export { cosineSimilarity };

/**
 * Compute pairwise similarity matrix between all face embeddings.
 */
function computeSimilarityMatrix(faces: FaceInstance[]): number[][] {
  const n = faces.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const sim = cosineSimilarity(faces[i].embedding, faces[j].embedding);
      matrix[i][j] = sim;
      matrix[j][i] = sim;
    }
  }

  return matrix;
}

/**
 * Cluster faces using hierarchical agglomerative clustering with cosine similarity.
 * Faces with similarity > threshold are grouped together.
 */
export function clusterFaces(faces: FaceInstance[], threshold: number = 0.75): FaceCluster[] {
  if (faces.length === 0) return [];

  const matrix = computeSimilarityMatrix(faces);
  const n = faces.length;

  // Union-Find for grouping
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(x: number): number {
    if (parent[x] !== x) {
      parent[x] = find(parent[x]);
    }
    return parent[x];
  }

  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[ra] = rb;
    }
  }

  // Group faces with similarity above threshold
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (matrix[i][j] >= threshold) {
        union(i, j);
      }
    }
  }

  // Collect clusters
  const clusterMap = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusterMap.has(root)) {
      clusterMap.set(root, []);
    }
    clusterMap.get(root)!.push(i);
  }

  // Build FaceCluster objects
  const clusters: FaceCluster[] = [];
  for (const [root, indices] of clusterMap) {
    const clusterFaces = indices.map((i) => faces[i]);

    // Select the face with the most connections (highest average similarity) as representative
    let bestIdx = indices[0];
    let bestAvgSim = -1;

    for (const idx of indices) {
      let totalSim = 0;
      let count = 0;
      for (const otherIdx of indices) {
        if (idx !== otherIdx) {
          totalSim += matrix[idx][otherIdx];
          count++;
        }
      }
      const avgSim = count > 0 ? totalSim / count : 0;
      if (avgSim > bestAvgSim) {
        bestAvgSim = avgSim;
        bestIdx = idx;
      }
    }

    clusters.push({
      id: crypto.randomUUID(),
      name: null,
      representativeFace: faces[bestIdx].description,
      faceInstances: clusterFaces,
      thumbnailFileId: faces[bestIdx].fileId,
    });
  }

  // Sort clusters by face count (most faces first)
  clusters.sort((a, b) => b.faceInstances.length - a.faceInstances.length);

  return clusters;
}

/**
 * Try to add a face to an existing cluster.
 * Returns true if the face was added (similarity above threshold).
 */
export function addFaceToCluster(
  cluster: FaceCluster,
  face: FaceInstance,
  threshold: number = 0.75
): boolean {
  // Check similarity against the representative face (first face in cluster)
  if (cluster.faceInstances.length > 0) {
    const representative = cluster.faceInstances[0];
    const sim = cosineSimilarity(face.embedding, representative.embedding);
    if (sim >= threshold) {
      cluster.faceInstances.push(face);
      return true;
    }

    // Also check against all instances for better matching
    let maxSim = sim;
    for (const instance of cluster.faceInstances) {
      const s = cosineSimilarity(face.embedding, instance.embedding);
      if (s > maxSim) maxSim = s;
    }

    if (maxSim >= threshold) {
      cluster.faceInstances.push(face);
      return true;
    }
  }

  return false;
}

/**
 * Find the best matching cluster for a face.
 * Returns the cluster with the highest average similarity above threshold, or null.
 */
export function findBestCluster(
  face: FaceInstance,
  clusters: FaceCluster[],
  threshold: number = 0.75
): FaceCluster | null {
  let bestCluster: FaceCluster | null = null;
  let bestSim = threshold;

  for (const cluster of clusters) {
    if (cluster.faceInstances.length === 0) continue;

    // Compute average similarity against all instances in the cluster
    let totalSim = 0;
    let maxSim = 0;

    for (const instance of cluster.faceInstances) {
      const sim = cosineSimilarity(face.embedding, instance.embedding);
      totalSim += sim;
      if (sim > maxSim) maxSim = sim;
    }

    const avgSim = totalSim / cluster.faceInstances.length;

    // Use max similarity for matching (more permissive)
    if (maxSim > bestSim) {
      bestSim = maxSim;
      bestCluster = cluster;
    }
  }

  return bestCluster;
}
