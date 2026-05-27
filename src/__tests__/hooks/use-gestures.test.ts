import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, render, act } from '@testing-library/react';
import { createElement, useRef, useEffect } from 'react';
import {
  isTouchDevice,
  useSwipeLeft,
  useLongPress,
  usePullToRefresh,
} from '@/hooks/use-gestures';

// --- isTouchDevice tests ---

describe('isTouchDevice', () => {
  const originalOntouchstart = 'ontouchstart' in window;
  const originalMaxTouchPoints = navigator.maxTouchPoints;

  afterEach(() => {
    // Restore
    if (!originalOntouchstart) {
      delete (window as any).ontouchstart;
    }
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: originalMaxTouchPoints,
      writable: true,
      configurable: true,
    });
  });

  it('returns true when ontouchstart in window', () => {
    (window as any).ontouchstart = () => {};
    expect(isTouchDevice()).toBe(true);
  });

  it('returns false on desktop (no touch support)', () => {
    delete (window as any).ontouchstart;
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 0,
      writable: true,
      configurable: true,
    });
    expect(isTouchDevice()).toBe(false);
  });

  it('returns true when navigator.maxTouchPoints > 0', () => {
    delete (window as any).ontouchstart;
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 5,
      writable: true,
      configurable: true,
    });
    expect(isTouchDevice()).toBe(true);
  });
});

// --- useSwipeLeft tests ---

function createTouch(target: EventTarget, x: number, y: number): Touch {
  return {
    clientX: x,
    clientY: y,
    identifier: 0,
    target,
    pageX: x,
    pageY: y,
    screenX: x,
    screenY: y,
    radiusX: 0,
    radiusY: 0,
    rotationAngle: 0,
    force: 1,
  } as Touch;
}

function fireTouchStart(el: HTMLElement, x: number, y: number) {
  const touch = createTouch(el, x, y);
  const event = new TouchEvent('touchstart', {
    bubbles: true,
    cancelable: true,
    touches: [touch],
    targetTouches: [touch],
  });
  el.dispatchEvent(event);
}

function fireTouchEnd(el: HTMLElement, x: number, y: number) {
  const touch = createTouch(el, x, y);
  const event = new TouchEvent('touchend', {
    bubbles: true,
    cancelable: true,
    changedTouches: [touch],
    touches: [],
  });
  el.dispatchEvent(event);
}

function fireTouchMove(el: HTMLElement, x: number, y: number) {
  const touch = createTouch(el, x, y);
  const event = new TouchEvent('touchmove', {
    bubbles: true,
    cancelable: true,
    touches: [touch],
    changedTouches: [touch],
  });
  el.dispatchEvent(event);
}

// Test component that uses useSwipeLeft
/* eslint-disable react-hooks/refs */
function SwipeTestComponent({
  onSwipe,
  threshold = 50,
}: {
  onSwipe: () => void;
  threshold?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useSwipeLeft(ref, onSwipe, { threshold });
  return createElement('div', { ref, 'data-testid': 'swipe-area' });
}
/* eslint-enable react-hooks/refs */

describe('useSwipeLeft', () => {
  beforeEach(() => {
    // Ensure touch is detected
    (window as any).ontouchstart = () => {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fires callback when swipe left beyond threshold', () => {
    const onSwipe = vi.fn();
    const { container } = render(createElement(SwipeTestComponent, { onSwipe }));
    const el = container.querySelector('[data-testid="swipe-area"]') as HTMLElement;

    // Swipe from x=200 to x=100 (diffX = 100 > 50 threshold)
    fireTouchStart(el, 200, 100);
    fireTouchEnd(el, 100, 100);

    expect(onSwipe).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire callback on swipe right', () => {
    const onSwipe = vi.fn();
    const { container } = render(createElement(SwipeTestComponent, { onSwipe }));
    const el = container.querySelector('[data-testid="swipe-area"]') as HTMLElement;

    // Swipe from x=100 to x=200 (right swipe)
    fireTouchStart(el, 100, 100);
    fireTouchEnd(el, 200, 100);

    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('does NOT fire callback on vertical swipe', () => {
    const onSwipe = vi.fn();
    const { container } = render(createElement(SwipeTestComponent, { onSwipe }));
    const el = container.querySelector('[data-testid="swipe-area"]') as HTMLElement;

    // Swipe vertically: start (100, 0), end (80, 200)
    // diffX = 100 - 80 = 20, diffY = 200, diffY(200) > diffX * 0.6 (12) → vertical
    fireTouchStart(el, 100, 0);
    fireTouchEnd(el, 80, 200);

    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('does NOT fire when swipe is below threshold', () => {
    const onSwipe = vi.fn();
    const { container } = render(
      createElement(SwipeTestComponent, { onSwipe, threshold: 100 })
    );
    const el = container.querySelector('[data-testid="swipe-area"]') as HTMLElement;

    // Swipe from x=200 to x=150 (diffX = 50 < 100 threshold)
    fireTouchStart(el, 200, 100);
    fireTouchEnd(el, 150, 100);

    expect(onSwipe).not.toHaveBeenCalled();
  });
});

// --- useLongPress tests ---

/* eslint-disable react-hooks/refs */
function LongPressTestComponent({
  onLongPress,
  delay = 500,
}: {
  onLongPress: () => void;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLongPress(ref, onLongPress, { delay });
  return createElement('div', { ref, 'data-testid': 'long-press-area' });
}
/* eslint-enable react-hooks/refs */

describe('useLongPress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (window as any).ontouchstart = () => {};
    // Mock navigator.vibrate
    Object.defineProperty(navigator, 'vibrate', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires callback after delay', () => {
    const onLongPress = vi.fn();
    const { container } = render(
      createElement(LongPressTestComponent, { onLongPress, delay: 500 })
    );
    const el = container.querySelector('[data-testid="long-press-area"]') as HTMLElement;

    fireTouchStart(el, 100, 100);

    // Not fired yet
    expect(onLongPress).not.toHaveBeenCalled();

    // Advance by 499ms - still not fired
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(onLongPress).not.toHaveBeenCalled();

    // Advance past the 500ms delay
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(navigator.vibrate).toHaveBeenCalledWith(50);
  });

  it('cancels on touch move > 10px', () => {
    const onLongPress = vi.fn();
    const { container } = render(
      createElement(LongPressTestComponent, { onLongPress, delay: 500 })
    );
    const el = container.querySelector('[data-testid="long-press-area"]') as HTMLElement;

    fireTouchStart(el, 100, 100);

    // Move more than 10px
    act(() => {
      fireTouchMove(el, 120, 100);
    });

    // Advance past the delay
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('cancels on early touch end', () => {
    const onLongPress = vi.fn();
    const { container } = render(
      createElement(LongPressTestComponent, { onLongPress, delay: 500 })
    );
    const el = container.querySelector('[data-testid="long-press-area"]') as HTMLElement;

    fireTouchStart(el, 100, 100);

    // End before delay
    fireTouchEnd(el, 100, 100);

    // Advance past the delay
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });
});

// --- usePullToRefresh tests ---

/* eslint-disable react-hooks/refs */
function PullToRefreshTestComponent({
  onRefresh,
  threshold = 80,
}: {
  onRefresh: () => Promise<void>;
  threshold?: number;
}) {
  const { isPulling, isRefreshing, pullDistance, bindEvents } = usePullToRefresh(
    onRefresh,
    { threshold }
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cleanup = bindEvents(ref.current);
    return () => cleanup?.();
  }, [bindEvents]);

  return createElement(
    'div',
    {
      ref,
      'data-testid': 'pull-area',
      style: { height: '200px' },
    },
    isPulling ? 'pulling' : isRefreshing ? 'refreshing' : `distance:${pullDistance}`
  );
}
/* eslint-enable react-hooks/refs */

describe('usePullToRefresh', () => {
  beforeEach(() => {
    (window as any).ontouchstart = () => {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enters pulling state when pulled down', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      createElement(PullToRefreshTestComponent, { onRefresh, threshold: 80 })
    );
    const el = container.querySelector('[data-testid="pull-area"]') as HTMLElement;

    // Start touch at top (scrollTop = 0 by default)
    fireTouchStart(el, 100, 50);

    // Pull down 30px (clientY goes from 50 to 80)
    act(() => {
      fireTouchMove(el, 100, 80);
    });

    // After pulling down, should show pulling state
    expect(el.textContent).toBe('pulling');
  });

  it('does not enter pulling state when not at top', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      createElement(PullToRefreshTestComponent, { onRefresh, threshold: 80 })
    );
    const el = container.querySelector('[data-testid="pull-area"]') as HTMLElement;

    // Simulate scrolled down by setting scrollTop
    Object.defineProperty(el, 'scrollTop', { value: 100, writable: true, configurable: true });

    fireTouchStart(el, 100, 50);
    act(() => {
      fireTouchMove(el, 100, 80);
    });

    // Should NOT show pulling state
    expect(el.textContent).not.toBe('pulling');
  });

  it('triggers refresh when pulled past threshold and released', async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      createElement(PullToRefreshTestComponent, { onRefresh, threshold: 80 })
    );
    const el = container.querySelector('[data-testid="pull-area"]') as HTMLElement;

    fireTouchStart(el, 100, 0);

    // Pull far enough: diff = 300, resisted = 300*0.4 = 120 > 80 threshold
    act(() => {
      fireTouchMove(el, 100, 300);
    });

    act(() => {
      fireTouchEnd(el, 100, 300);
    });

    // Should enter refreshing state
    expect(el.textContent).toBe('refreshing');

    // Wait for refresh to complete
    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });

    vi.useRealTimers();
  });
});
