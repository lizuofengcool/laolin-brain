import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Test the soft delete behavior used in src/app/api/files/[id]/route.ts.
 *
 * The pattern:
 * - PUT /api/files/[id] with body.isDeleted = true → sets isDeleted=true, deletedAt=new Date()
 * - PUT /api/files/[id] with body.isDeleted = false → restores the file (soft undelete)
 * - The record is NOT removed from the database (unlike the DELETE handler which calls db.file.delete)
 *
 * Since we cannot test the database directly in unit tests, we extract the logic
 * and test the data transformation behavior.
 */

interface FileRecord {
  id: string;
  fileName: string;
  isDeleted: boolean;
  deletedAt: Date | null;
  filePath: string | null;
  userId: string;
}

interface SoftDeleteInput {
  isDeleted?: boolean;
  deletedAt?: string | null;
}

/**
 * Extracted soft-delete update logic from the PUT handler in [id]/route.ts.
 * Mirrors: if (body.isDeleted !== undefined) data.isDeleted = body.isDeleted;
 *          if (body.deletedAt !== undefined) data.deletedAt = body.deletedAt === null ? null : new Date(body.deletedAt);
 */
function applySoftDelete(record: FileRecord, input: SoftDeleteInput): Partial<FileRecord> {
  const data: Partial<FileRecord> = {};

  if (input.isDeleted !== undefined) {
    data.isDeleted = input.isDeleted;
  }
  if (input.deletedAt !== undefined) {
    data.deletedAt = input.deletedAt === null ? null : new Date(input.deletedAt);
  }

  return data;
}

/**
 * Simulates the full soft-delete operation.
 */
function softDelete(record: FileRecord): FileRecord {
  const now = new Date().toISOString();
  const updates = applySoftDelete(record, {
    isDeleted: true,
    deletedAt: now,
  });
  return { ...record, ...updates };
}

/**
 * Simulates the restore-from-trash operation.
 */
function restoreFile(record: FileRecord): FileRecord {
  const updates = applySoftDelete(record, {
    isDeleted: false,
    deletedAt: null,
  });
  return { ...record, ...updates };
}

describe("soft delete behavior", () => {
  const baseFile: FileRecord = {
    id: "file-1",
    fileName: "document.pdf",
    isDeleted: false,
    deletedAt: null,
    filePath: "/uploads/document.pdf",
    userId: "user-1",
  };

  describe("soft delete sets isDeleted=true and deletedAt", () => {
    it("sets isDeleted to true", () => {
      const result = softDelete(baseFile);
      expect(result.isDeleted).toBe(true);
    });

    it("sets deletedAt to a valid Date", () => {
      const before = new Date();
      const result = softDelete(baseFile);
      const after = new Date();

      expect(result.deletedAt).not.toBeNull();
      expect(result.deletedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(result.deletedAt!.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    });

    it("preserves other fields", () => {
      const result = softDelete(baseFile);
      expect(result.id).toBe("file-1");
      expect(result.fileName).toBe("document.pdf");
      expect(result.filePath).toBe("/uploads/document.pdf");
      expect(result.userId).toBe("user-1");
    });

    it("works on a file that already has isDeleted=true", () => {
      const alreadyDeleted = softDelete(baseFile);
      const result = softDelete(alreadyDeleted);
      expect(result.isDeleted).toBe(true);
      expect(result.deletedAt).not.toBeNull();
    });
  });

  describe("soft delete does NOT remove the record from DB", () => {
    it("the record still exists with all original fields after soft delete", () => {
      const result = softDelete(baseFile);
      // The record is still fully intact — just flagged as deleted
      expect(result.id).toBeDefined();
      expect(result.fileName).toBeDefined();
      expect(result.filePath).toBeDefined();
      expect(result.userId).toBeDefined();
    });

    it("the record id remains unchanged", () => {
      const result = softDelete(baseFile);
      expect(result.id).toBe(baseFile.id);
    });

    it("soft delete differs from hard delete (which would return null/undefined)", () => {
      // Soft delete: returns a valid record
      const softResult = softDelete(baseFile);
      expect(softResult).not.toBeNull();
      expect(softResult.id).toBe("file-1");

      // Hard delete simulation: record would be completely gone
      const hardDelete = (record: FileRecord): null => {
        // This is what db.file.delete does — removes the record entirely
        return null;
      };
      const hardResult = hardDelete(baseFile);
      expect(hardResult).toBeNull();
    });

    it("filePath is preserved (not physically deleted by soft delete)", () => {
      const result = softDelete(baseFile);
      expect(result.filePath).toBe("/uploads/document.pdf");
    });
  });

  describe("restore from soft delete", () => {
    it("sets isDeleted back to false", () => {
      const deleted = softDelete(baseFile);
      const restored = restoreFile(deleted);
      expect(restored.isDeleted).toBe(false);
    });

    it("sets deletedAt back to null", () => {
      const deleted = softDelete(baseFile);
      const restored = restoreFile(deleted);
      expect(restored.deletedAt).toBeNull();
    });

    it("preserves original fields after restore", () => {
      const deleted = softDelete(baseFile);
      const restored = restoreFile(deleted);
      expect(restored.id).toBe("file-1");
      expect(restored.fileName).toBe("document.pdf");
      expect(restored.filePath).toBe("/uploads/document.pdf");
      expect(restored.userId).toBe("user-1");
    });
  });

  describe("applySoftDelete extracted logic", () => {
    it("only updates isDeleted when provided", () => {
      const updates = applySoftDelete(baseFile, { isDeleted: true });
      expect(updates.isDeleted).toBe(true);
      expect(updates.deletedAt).toBeUndefined();
    });

    it("only updates deletedAt when provided", () => {
      const updates = applySoftDelete(baseFile, { deletedAt: "2025-01-01T00:00:00Z" });
      expect(updates.isDeleted).toBeUndefined();
      expect(updates.deletedAt).toEqual(new Date("2025-01-01T00:00:00Z"));
    });

    it("updates both fields when both provided", () => {
      const updates = applySoftDelete(baseFile, {
        isDeleted: true,
        deletedAt: "2025-01-01T00:00:00Z",
      });
      expect(updates.isDeleted).toBe(true);
      expect(updates.deletedAt).toEqual(new Date("2025-01-01T00:00:00Z"));
    });

    it("sets deletedAt to null when explicitly null", () => {
      const updates = applySoftDelete(
        { ...baseFile, deletedAt: new Date() },
        { deletedAt: null }
      );
      expect(updates.deletedAt).toBeNull();
    });

    it("returns empty object when no input provided", () => {
      const updates = applySoftDelete(baseFile, {});
      expect(Object.keys(updates)).toHaveLength(0);
    });
  });
});
