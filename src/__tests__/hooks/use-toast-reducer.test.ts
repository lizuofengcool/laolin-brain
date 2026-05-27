import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reducer } from "@/hooks/use-toast";

// Type for toast items used in tests
interface TestToast {
  id: string;
  title?: string;
  description?: string;
  open?: boolean;
  variant?: "default" | "destructive";
  [key: string]: unknown;
}

const emptyState = { toasts: [] };

describe("toast reducer", () => {
  describe("ADD_TOAST", () => {
    it("adds a toast to the front of the list", () => {
      const toast: TestToast = { id: "1", title: "Hello", open: true };
      const result = reducer(emptyState, { type: "ADD_TOAST", toast });
      expect(result.toasts).toHaveLength(1);
      expect(result.toasts[0].id).toBe("1");
    });

    it("adds new toast before existing toasts (prepend)", () => {
      const state = { toasts: [{ id: "1", title: "First" }] };
      const toast: TestToast = { id: "2", title: "Second", open: true };
      const result = reducer(state, { type: "ADD_TOAST", toast });
      expect(result.toasts).toHaveLength(2);
      expect(result.toasts[0].id).toBe("2");
      expect(result.toasts[1].id).toBe("1");
    });

    it("enforces a limit of 5 toasts", () => {
      const state = {
        toasts: [
          { id: "1", title: "T1" },
          { id: "2", title: "T2" },
          { id: "3", title: "T3" },
          { id: "4", title: "T4" },
          { id: "5", title: "T5" },
        ],
      };
      const newToast: TestToast = { id: "6", title: "T6", open: true };
      const result = reducer(state, { type: "ADD_TOAST", toast: newToast });
      expect(result.toasts).toHaveLength(5);
      expect(result.toasts[0].id).toBe("6");
      // slice(0,5) removes the last item (T5), keeps T1
      expect(result.toasts.find((t) => t.id === "1")).toBeDefined();
      expect(result.toasts.find((t) => t.id === "5")).toBeUndefined();
    });

    it("does not mutate the original state", () => {
      const state = { toasts: [{ id: "1", title: "T1" }] };
      const toast: TestToast = { id: "2", title: "T2", open: true };
      reducer(state, { type: "ADD_TOAST", toast });
      expect(state.toasts).toHaveLength(1);
      expect(state.toasts[0].id).toBe("1");
    });
  });

  describe("UPDATE_TOAST", () => {
    it("merges partial data into matching toast", () => {
      const state = { toasts: [{ id: "1", title: "Hello", description: "World" }] };
      const result = reducer(state, {
        type: "UPDATE_TOAST",
        toast: { id: "1", title: "Updated" },
      });
      expect(result.toasts[0].title).toBe("Updated");
      expect(result.toasts[0].description).toBe("World");
    });

    it("does not affect other toasts", () => {
      const state = {
        toasts: [
          { id: "1", title: "First" },
          { id: "2", title: "Second" },
        ],
      };
      const result = reducer(state, {
        type: "UPDATE_TOAST",
        toast: { id: "1", description: "Added desc" },
      });
      expect(result.toasts[0].description).toBe("Added desc");
      expect(result.toasts[1].title).toBe("Second");
      expect(result.toasts[1].description).toBeUndefined();
    });

    it("does nothing when id does not match", () => {
      const state = { toasts: [{ id: "1", title: "Hello" }] };
      const result = reducer(state, {
        type: "UPDATE_TOAST",
        toast: { id: "nonexistent", title: "Updated" },
      });
      expect(result.toasts[0].title).toBe("Hello");
    });
  });

  describe("DISMISS_TOAST", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("sets open=false for the specified toast", () => {
      const state = {
        toasts: [{ id: "1", title: "Hello", open: true }],
      };
      const result = reducer(state, {
        type: "DISMISS_TOAST",
        toastId: "1",
      });
      expect(result.toasts[0].open).toBe(false);
    });

    it("sets open=false for all toasts when no id is specified", () => {
      const state = {
        toasts: [
          { id: "1", title: "T1", open: true },
          { id: "2", title: "T2", open: true },
        ],
      };
      const result = reducer(state, {
        type: "DISMISS_TOAST",
      });
      expect(result.toasts[0].open).toBe(false);
      expect(result.toasts[1].open).toBe(false);
    });

    it("does not affect non-matching toasts", () => {
      const state = {
        toasts: [
          { id: "1", title: "T1", open: true },
          { id: "2", title: "T2", open: true },
        ],
      };
      const result = reducer(state, {
        type: "DISMISS_TOAST",
        toastId: "1",
      });
      expect(result.toasts[0].open).toBe(false);
      expect(result.toasts[1].open).toBe(true);
    });

    it("does not mutate the original state", () => {
      const state = {
        toasts: [{ id: "1", title: "T1", open: true }],
      };
      reducer(state, { type: "DISMISS_TOAST", toastId: "1" });
      expect(state.toasts[0].open).toBe(true);
    });
  });

  describe("REMOVE_TOAST", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("removes the toast with the specified id", () => {
      const state = {
        toasts: [
          { id: "1", title: "T1" },
          { id: "2", title: "T2" },
        ],
      };
      const result = reducer(state, {
        type: "REMOVE_TOAST",
        toastId: "1",
      });
      expect(result.toasts).toHaveLength(1);
      expect(result.toasts[0].id).toBe("2");
    });

    it("removes all toasts when no id is specified", () => {
      const state = {
        toasts: [
          { id: "1", title: "T1" },
          { id: "2", title: "T2" },
        ],
      };
      const result = reducer(state, { type: "REMOVE_TOAST" });
      expect(result.toasts).toHaveLength(0);
    });

    it("does nothing when id does not match", () => {
      const state = {
        toasts: [{ id: "1", title: "T1" }],
      };
      const result = reducer(state, {
        type: "REMOVE_TOAST",
        toastId: "nonexistent",
      });
      expect(result.toasts).toHaveLength(1);
    });

    it("handles removing from empty state", () => {
      const result = reducer(emptyState, {
        type: "REMOVE_TOAST",
        toastId: "1",
      });
      expect(result.toasts).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("returns state unchanged for unknown action type", () => {
      const result = reducer(emptyState, { type: "UNKNOWN_ACTION" } as any);
      // Default case in switch returns state
      expect(result.toasts).toEqual([]);
    });

    it("handles empty toasts array for all actions", () => {
      // UPDATE_TOAST on empty
      const r1 = reducer(emptyState, { type: "UPDATE_TOAST", toast: { id: "1" } });
      expect(r1.toasts).toHaveLength(0);

      // DISMISS_TOAST on empty
      const r2 = reducer(emptyState, { type: "DISMISS_TOAST", toastId: "1" });
      expect(r2.toasts).toHaveLength(0);

      // REMOVE_TOAST on empty
      const r3 = reducer(emptyState, { type: "REMOVE_TOAST", toastId: "1" });
      expect(r3.toasts).toHaveLength(0);
    });

    it("ADD_TOAST with toast that has all possible fields", () => {
      const toast = {
        id: "full",
        title: "Full Toast",
        description: "A detailed description",
        open: true,
        variant: "destructive" as const,
      };
      const result = reducer(emptyState, { type: "ADD_TOAST", toast });
      expect(result.toasts[0]).toEqual(toast);
    });
  });
});
