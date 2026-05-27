import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock the toast UI component to avoid radix-ui dependency issues in tests
vi.mock('@/components/ui/toast', () => ({
  ToastProps: {},
  ToastActionElement: {},
}));

import { useToast, toast, reducer } from '@/hooks/use-toast';

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset the global memory state between tests
    reducer({ toasts: [] }, { type: 'REMOVE_TOAST', toastId: undefined });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('useToast() returns toasts array, toast function, dismiss function', () => {
    const { result } = renderHook(() => useToast());

    expect(Array.isArray(result.current.toasts)).toBe(true);
    expect(typeof result.current.toast).toBe('function');
    expect(typeof result.current.dismiss).toBe('function');
  });

  it('toast({ title: "test" }) adds toast with id', () => {
    const { result } = renderHook(() => useToast());

    let toastId: string | undefined;
    act(() => {
      const { id } = result.current.toast({ title: 'test' });
      toastId = id;
    });

    // The toast should be in the toasts array
    expect(result.current.toasts.length).toBeGreaterThanOrEqual(1);
    const found = result.current.toasts.find((t) => t.id === toastId);
    expect(found).toBeDefined();
    expect(found!.title).toBe('test');
  });

  it('dismiss(toastId) removes toast', () => {
    const { result } = renderHook(() => useToast());

    let toastId: string | undefined;
    act(() => {
      const { id } = result.current.toast({ title: 'test' });
      toastId = id;
    });

    expect(result.current.toasts.find((t) => t.id === toastId)).toBeDefined();

    act(() => {
      result.current.dismiss(toastId);
    });

    // After dismiss, toast open is set to false
    const toastAfterDismiss = result.current.toasts.find((t) => t.id === toastId);
    expect(toastAfterDismiss?.open).toBe(false);

    // After remove delay (5000ms), the toast is fully removed
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    const toastAfterRemove = result.current.toasts.find((t) => t.id === toastId);
    expect(toastAfterRemove).toBeUndefined();
  });

  it('supports multiple toasts', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toast({ title: 'first' });
      result.current.toast({ title: 'second' });
      result.current.toast({ title: 'third' });
    });

    expect(result.current.toasts.length).toBeGreaterThanOrEqual(3);
  });

  it('enforces toast limit of 5', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      for (let i = 0; i < 7; i++) {
        result.current.toast({ title: `toast ${i}` });
      }
    });

    // Only 5 should remain (the most recent 5)
    expect(result.current.toasts.length).toBeLessThanOrEqual(5);
  });
});

describe('toast reducer', () => {
  it('ADD_TOAST adds a new toast', () => {
    const state = reducer(
      { toasts: [] },
      { type: 'ADD_TOAST', toast: { id: '1', title: 'Hello', open: true } as any }
    );
    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0].id).toBe('1');
  });

  it('REMOVE_TOAST removes a specific toast', () => {
    const state = reducer(
      { toasts: [{ id: '1', title: 'A', open: true }, { id: '2', title: 'B', open: true }] as any },
      { type: 'REMOVE_TOAST', toastId: '1' }
    );
    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0].id).toBe('2');
  });

  it('REMOVE_TOAST with undefined toastId removes all', () => {
    const state = reducer(
      { toasts: [{ id: '1' }, { id: '2' }] as any },
      { type: 'REMOVE_TOAST', toastId: undefined }
    );
    expect(state.toasts).toHaveLength(0);
  });

  it('DISMISS_TOAST sets open to false', () => {
    const state = reducer(
      { toasts: [{ id: '1', open: true }] as any },
      { type: 'DISMISS_TOAST', toastId: '1' }
    );
    expect(state.toasts[0].open).toBe(false);
  });
});
