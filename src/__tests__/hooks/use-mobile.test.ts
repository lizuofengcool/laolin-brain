import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '@/hooks/use-mobile';

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('useIsMobile', () => {
  let originalInnerWidth: number;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original innerWidth
    Object.defineProperty(window, 'innerWidth', {
      value: originalInnerWidth,
      writable: true,
      configurable: true,
    });
  });

  it('returns true when innerWidth < 768', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 500,
      writable: true,
      configurable: true,
    });
    // Update matchMedia mock to return matches: true for mobile query
    (window.matchMedia as ReturnType<typeof vi.fn>).mockImplementation((query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('returns false when innerWidth >= 768', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      writable: true,
      configurable: true,
    });
    (window.matchMedia as ReturnType<typeof vi.fn>).mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('updates on resize', () => {
    let changeCallback: (() => void) | null = null;

    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      writable: true,
      configurable: true,
    });

    (window.matchMedia as ReturnType<typeof vi.fn>).mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_event: string, cb: () => void) => {
        changeCallback = cb;
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    // Simulate resize by calling the change callback and updating innerWidth
    act(() => {
      Object.defineProperty(window, 'innerWidth', {
        value: 500,
        writable: true,
        configurable: true,
      });

      // Re-mock matchMedia to return matches: true
      (window.matchMedia as ReturnType<typeof vi.fn>).mockImplementation((query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((_event: string, cb: () => void) => {
          changeCallback = cb;
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      // Trigger the change callback that was registered via addEventListener
      if (changeCallback) {
        changeCallback();
      }
    });

    expect(result.current).toBe(true);

    // Resize back to desktop
    act(() => {
      Object.defineProperty(window, 'innerWidth', {
        value: 1024,
        writable: true,
        configurable: true,
      });

      (window.matchMedia as ReturnType<typeof vi.fn>).mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((_event: string, cb: () => void) => {
          changeCallback = cb;
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      if (changeCallback) {
        changeCallback();
      }
    });

    expect(result.current).toBe(false);
  });
});
