import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  clusterFaces,
  addFaceToCluster,
  findBestCluster,
  type FaceInstance,
  type FaceCluster,
} from "@/lib/face-cluster";

// Helper to create face instances for testing
function createFace(
  id: string,
  fileId: string,
  embedding: number[],
  description: string = "测试人脸"
): FaceInstance {
  return {
    fileId,
    faceId: id,
    embedding,
    description,
    x: 10,
    y: 10,
    width: 20,
    height: 20,
  };
}

// Generate a normalized random embedding
function randomEmbedding(seed: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < 32; i++) {
    // Use a simple pseudo-random based on seed
    const val = Math.sin(seed * (i + 1) * 9.8) * 0.5 + 0.5;
    result.push(Math.round(val * 1000) / 1000);
  }
  // Normalize
  const norm = Math.sqrt(result.reduce((s, v) => s + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < result.length; i++) {
      result[i] = Math.round((result[i] / norm) * 1000) / 1000;
    }
  }
  return result;
}

// Make an embedding similar to another by adding small noise
function similarEmbedding(base: number[], noise: number = 0.05): number[] {
  return base.map((v) => {
    const delta = (Math.random() - 0.5) * noise;
    return Math.round((v + delta) * 1000) / 1000;
  });
}

describe("cosineSimilarity", () => {
  it("should return 1 for identical vectors", () => {
    const vec = [0.5, 0.5, 0.5, 0.5];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 5);
  });

  it("should return 0 for orthogonal vectors", () => {
    const a = [1, 0];
    const b = [0, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it("should return -1 for opposite vectors", () => {
    const a = [1, 0];
    const b = [-1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it("should handle empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [])).toBe(0);
  });

  it("should handle vectors of different lengths", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("should return high similarity for similar vectors", () => {
    const a = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    const b = [0.11, 0.21, 0.29, 0.41, 0.49, 0.61, 0.69, 0.81];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0.99);
  });
});

describe("clusterFaces", () => {
  it("should return empty array for empty input", () => {
    expect(clusterFaces([])).toEqual([]);
  });

  it("should create one cluster per unique face when threshold is high", () => {
    const faces = [
      createFace("f1", "img1", randomEmbedding(1)),
      createFace("f2", "img2", randomEmbedding(100)),
      createFace("f3", "img3", randomEmbedding(200)),
    ];

    const clusters = clusterFaces(faces, 0.99);
    expect(clusters.length).toBe(3);
  });

  it("should group similar faces into one cluster", () => {
    const baseEmbedding = randomEmbedding(42);
    const faces = [
      createFace("f1", "img1", baseEmbedding),
      createFace("f2", "img2", similarEmbedding(baseEmbedding, 0.02)),
      createFace("f3", "img3", similarEmbedding(baseEmbedding, 0.03)),
      createFace("f4", "img4", randomEmbedding(999)), // Different person
    ];

    const clusters = clusterFaces(faces, 0.9);
    expect(clusters.length).toBe(2);

    // The cluster with 3 faces should be first (sorted by face count)
    expect(clusters[0].faceInstances.length).toBe(3);
    expect(clusters[1].faceInstances.length).toBe(1);
  });

  it("should assign representative face description", () => {
    const baseEmbedding = randomEmbedding(42);
    const faces = [
      createFace("f1", "img1", baseEmbedding, "男性,25-35岁"),
      createFace("f2", "img2", similarEmbedding(baseEmbedding, 0.02), "男性,25-35岁"),
    ];

    const clusters = clusterFaces(faces, 0.8);
    expect(clusters.length).toBe(1);
    expect(clusters[0].representativeFace).toBeTruthy();
    expect(clusters[0].thumbnailFileId).toBeTruthy();
  });

  it("should sort clusters by face count descending", () => {
    const baseA = randomEmbedding(1);
    const baseB = randomEmbedding(2);

    const faces = [
      createFace("f1", "img1", randomEmbedding(999)), // Solo
      createFace("f2", "img2", similarEmbedding(baseA, 0.02)),
      createFace("f3", "img3", similarEmbedding(baseA, 0.02)),
      createFace("f4", "img4", similarEmbedding(baseA, 0.02)),
      createFace("f5", "img5", similarEmbedding(baseB, 0.02)),
      createFace("f6", "img6", similarEmbedding(baseB, 0.02)),
    ];

    const clusters = clusterFaces(faces, 0.9);
    expect(clusters.length).toBe(3);
    expect(clusters[0].faceInstances.length).toBeGreaterThanOrEqual(clusters[1].faceInstances.length);
    expect(clusters[1].faceInstances.length).toBeGreaterThanOrEqual(clusters[2].faceInstances.length);
  });
});

describe("addFaceToCluster", () => {
  it("should add face to cluster when similarity is above threshold", () => {
    const baseEmbedding = randomEmbedding(42);
    const cluster: FaceCluster = {
      id: "cluster_1",
      name: null,
      representativeFace: "男性,25-35岁",
      faceInstances: [
        createFace("f1", "img1", baseEmbedding, "男性,25-35岁"),
      ],
      thumbnailFileId: "img1",
    };

    const newFace = createFace("f2", "img2", similarEmbedding(baseEmbedding, 0.02));
    const result = addFaceToCluster(cluster, newFace, 0.8);

    expect(result).toBe(true);
    expect(cluster.faceInstances.length).toBe(2);
  });

  it("should not add face to cluster when similarity is below threshold", () => {
    const cluster: FaceCluster = {
      id: "cluster_1",
      name: null,
      representativeFace: "男性,25-35岁",
      faceInstances: [
        createFace("f1", "img1", randomEmbedding(42)),
      ],
    };

    const newFace = createFace("f2", "img2", randomEmbedding(999));
    const result = addFaceToCluster(cluster, newFace, 0.95);

    expect(result).toBe(false);
    expect(cluster.faceInstances.length).toBe(1);
  });

  it("should handle empty cluster gracefully", () => {
    const cluster: FaceCluster = {
      id: "cluster_1",
      name: null,
      representativeFace: "",
      faceInstances: [],
    };

    const newFace = createFace("f2", "img2", randomEmbedding(1));
    const result = addFaceToCluster(cluster, newFace, 0.8);

    expect(result).toBe(false);
  });
});

describe("findBestCluster", () => {
  it("should find the best matching cluster", () => {
    const baseA = randomEmbedding(1);
    const baseB = randomEmbedding(2);

    const clusters: FaceCluster[] = [
      {
        id: "cluster_A",
        name: "Alice",
        representativeFace: "女性,20-30岁",
        faceInstances: [
          createFace("f1", "img1", baseA, "女性,20-30岁"),
        ],
        thumbnailFileId: "img1",
      },
      {
        id: "cluster_B",
        name: "Bob",
        representativeFace: "男性,30-40岁",
        faceInstances: [
          createFace("f2", "img2", baseB, "男性,30-40岁"),
        ],
        thumbnailFileId: "img2",
      },
    ];

    const newFace = createFace("f3", "img3", similarEmbedding(baseA, 0.02));
    const best = findBestCluster(newFace, clusters, 0.8);

    expect(best).not.toBeNull();
    expect(best!.id).toBe("cluster_A");
  });

  it("should return null when no cluster matches", () => {
    const clusters: FaceCluster[] = [
      {
        id: "cluster_A",
        name: null,
        representativeFace: "女性",
        faceInstances: [
          createFace("f1", "img1", randomEmbedding(1)),
        ],
      },
    ];

    const newFace = createFace("f2", "img2", randomEmbedding(999));
    const best = findBestCluster(newFace, clusters, 0.95);

    expect(best).toBeNull();
  });

  it("should return null for empty clusters list", () => {
    const newFace = createFace("f1", "img1", randomEmbedding(1));
    const best = findBestCluster(newFace, [], 0.8);

    expect(best).toBeNull();
  });

  it("should skip empty clusters", () => {
    const clusters: FaceCluster[] = [
      {
        id: "cluster_empty",
        name: null,
        representativeFace: "",
        faceInstances: [],
      },
    ];

    const newFace = createFace("f1", "img1", randomEmbedding(1));
    const best = findBestCluster(newFace, clusters, 0.8);

    expect(best).toBeNull();
  });
});
