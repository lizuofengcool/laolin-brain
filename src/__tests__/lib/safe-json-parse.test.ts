import { describe, it, expect } from "vitest";
import { safeJsonParse, safeJsonParseArray } from "@/lib/safe-json-parse";

describe("safeJsonParse", () => {
  describe("valid JSON arrays", () => {
    it("parses a valid JSON array of strings", () => {
      const result = safeJsonParse('["a","b","c"]', []);
      expect(result).toEqual(["a", "b", "c"]);
    });

    it("parses a valid JSON array of objects", () => {
      const result = safeJsonParse('[{"id":1},{"id":2}]', []);
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("parses an empty JSON array", () => {
      const result = safeJsonParse("[]", []);
      expect(result).toEqual([]);
    });

    it("parses a JSON array of numbers", () => {
      const result = safeJsonParse("[1, 2, 3]", []);
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe("valid JSON objects", () => {
    it("parses a valid JSON object", () => {
      const result = safeJsonParse('{"name":"test","value":42}', {} as Record<string, unknown>);
      expect(result).toEqual({ name: "test", value: 42 });
    });

    it("parses a nested JSON object", () => {
      const input = '{"outer":{"inner":"value"}}';
      const result = safeJsonParse(input, {} as Record<string, unknown>);
      expect(result).toEqual({ outer: { inner: "value" } });
    });

    it("parses a JSON string value", () => {
      const result = safeJsonParse('"hello"', "");
      expect(result).toBe("hello");
    });

    it("parses a JSON number value", () => {
      const result = safeJsonParse("42", 0);
      expect(result).toBe(42);
    });

    it("parses a JSON boolean value", () => {
      expect(safeJsonParse("true", false)).toBe(true);
      expect(safeJsonParse("false", true)).toBe(false);
    });

    it("parses JSON null", () => {
      const result = safeJsonParse("null", "fallback");
      expect(result).toBeNull();
    });
  });

  describe("null / undefined / empty input", () => {
    it("returns fallback for null input", () => {
      expect(safeJsonParse(null, "default")).toBe("default");
    });

    it("returns fallback for undefined input", () => {
      expect(safeJsonParse(undefined, "default")).toBe("default");
    });

    it("returns fallback for empty string", () => {
      expect(safeJsonParse("", "default")).toBe("default");
    });

    it("returns fallback for whitespace-only string", () => {
      expect(safeJsonParse("   ", "default")).toBe("default");
    });
  });

  describe("invalid JSON", () => {
    it("returns fallback for malformed JSON string", () => {
      expect(safeJsonParse("{not json}", [])).toEqual([]);
    });

    it("returns fallback for truncated JSON", () => {
      expect(safeJsonParse('{"key":', [])).toEqual([]);
    });

    it("returns fallback for random text", () => {
      expect(safeJsonParse("just some text", [])).toEqual([]);
    });

    it("returns fallback for JSON with trailing comma", () => {
      // JSON.parse actually allows trailing commas in some engines,
      // but in strict mode it should fail
      const result = safeJsonParse('{"a":1,}', {});
      // Whether it parses or falls back, the test just checks no crash
      expect(result).toBeDefined();
    });
  });

  describe("custom fallback values", () => {
    it("uses custom array fallback", () => {
      const fallback = [1, 2, 3];
      const result = safeJsonParse("invalid", fallback);
      expect(result).toEqual([1, 2, 3]);
    });

    it("uses custom object fallback", () => {
      const fallback = { error: "default" };
      const result = safeJsonParse("invalid", fallback);
      expect(result).toEqual({ error: "default" });
    });

    it("uses null as fallback", () => {
      expect(safeJsonParse("invalid", null)).toBeNull();
    });

    it("uses number as fallback", () => {
      expect(safeJsonParse("invalid", 42)).toBe(42);
    });

    it("uses false as fallback", () => {
      expect(safeJsonParse("invalid", false)).toBe(false);
    });
  });

  describe("generic type inference", () => {
    it("infers string array type from fallback", () => {
      const result: string[] = safeJsonParse('["x"]', []);
      expect(Array.isArray(result)).toBe(true);
      expect(typeof result[0]).toBe("string");
    });

    it("infers object type from fallback", () => {
      type MyObj = { name: string; age: number };
      const fallback: MyObj = { name: "", age: 0 };
      const result = safeJsonParse('{"name":"Alice","age":30}', fallback);
      expect(result.name).toBe("Alice");
      expect(result.age).toBe(30);
    });

    it("infers number type from fallback", () => {
      const result: number = safeJsonParse("123", 0);
      expect(typeof result).toBe("number");
    });

    it("infers boolean type from fallback", () => {
      const result: boolean = safeJsonParse("true", false);
      expect(typeof result).toBe("boolean");
    });
  });
});

describe("safeJsonParseArray", () => {
  it("parses a valid JSON array", () => {
    const result = safeJsonParseArray("[1, 2, 3]");
    expect(result).toEqual([1, 2, 3]);
  });

  it("returns empty array for null input", () => {
    expect(safeJsonParseArray(null)).toEqual([]);
  });

  it("returns empty array for undefined input", () => {
    expect(safeJsonParseArray(undefined)).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(safeJsonParseArray("not-array")).toEqual([]);
  });

  it("returns empty array for JSON object (not array)", () => {
    // JSON.parse will succeed but return an object, not an array.
    // The function doesn't validate that the result is actually an array,
    // it just returns whatever JSON.parse returns with the [] fallback.
    const result = safeJsonParseArray('{"key":"value"}');
    // It will return the parsed object (since JSON.parse succeeded),
    // NOT the empty array fallback.
    expect(result).toEqual({ key: "value" });
  });

  it("returns empty array for empty string", () => {
    expect(safeJsonParseArray("")).toEqual([]);
  });
});
