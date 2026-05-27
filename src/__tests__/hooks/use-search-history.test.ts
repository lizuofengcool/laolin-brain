import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSearchHistory, addSearchHistory, clearSearchHistory } from '@/hooks/use-search-history';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('use-search-history', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('getSearchHistory', () => {
    it('returns empty array when localStorage is empty', () => {
      const result = getSearchHistory();
      expect(result).toEqual([]);
    });

    it('returns parsed array when data exists', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(['hello', 'world', 'test']));
      const result = getSearchHistory();
      expect(result).toEqual(['hello', 'world', 'test']);
    });

    it('returns empty array when localStorage has corrupted data', () => {
      localStorageMock.getItem.mockReturnValue('not-valid-json{{{');
      const result = getSearchHistory();
      expect(result).toEqual([]);
    });

    it('returns empty array when data is not an array', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify({ key: 'value' }));
      const result = getSearchHistory();
      expect(result).toEqual([]);
    });

    it('respects MAX_HISTORY limit of 20', () => {
      const history = Array.from({ length: 25 }, (_, i) => `item-${i}`);
      localStorageMock.getItem.mockReturnValue(JSON.stringify(history));
      const result = getSearchHistory();
      expect(result).toHaveLength(20);
      expect(result).toEqual(history.slice(0, 20));
    });
  });

  describe('addSearchHistory', () => {
    it('adds item to front of history', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(['old1', 'old2']));
      addSearchHistory('new');

      const setCall = localStorageMock.setItem.mock.calls[0];
      expect(setCall[0]).toBe('kb_search_history');
      const parsed = JSON.parse(setCall[1]);
      expect(parsed[0]).toBe('new');
      expect(parsed).toEqual(['new', 'old1', 'old2']);
    });

    it('adds item when history is empty', () => {
      localStorageMock.getItem.mockReturnValue(null);
      addSearchHistory('first');

      const setCall = localStorageMock.setItem.mock.calls[0];
      const parsed = JSON.parse(setCall[1]);
      expect(parsed).toEqual(['first']);
    });

    it('removes duplicate before adding', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(['hello', 'world', 'test']));
      addSearchHistory('world');

      const setCall = localStorageMock.setItem.mock.calls[0];
      const parsed = JSON.parse(setCall[1]);
      expect(parsed).toEqual(['world', 'hello', 'test']);
      // 'world' should appear only once, at the front
      expect(parsed.filter((x: string) => x === 'world')).toHaveLength(1);
    });

    it('is no-op for empty string', () => {
      addSearchHistory('');
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('is no-op for whitespace-only string', () => {
      addSearchHistory('   ');
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('trims the query before adding', () => {
      localStorageMock.getItem.mockReturnValue(null);
      addSearchHistory('  hello  ');

      const setCall = localStorageMock.setItem.mock.calls[0];
      const parsed = JSON.parse(setCall[1]);
      expect(parsed).toEqual(['hello']);
    });

    it('enforces 20-item limit', () => {
      const existing = Array.from({ length: 20 }, (_, i) => `item-${i}`);
      localStorageMock.getItem.mockReturnValue(JSON.stringify(existing));
      addSearchHistory('new-item');

      const setCall = localStorageMock.setItem.mock.calls[0];
      const parsed = JSON.parse(setCall[1]);
      expect(parsed).toHaveLength(20);
      expect(parsed[0]).toBe('new-item');
      // Last item from old array should be pushed out
      expect(parsed).not.toContain('item-19');
    });
  });

  describe('clearSearchHistory', () => {
    it('removes kb_search_history from localStorage', () => {
      clearSearchHistory();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('kb_search_history');
    });
  });
});
