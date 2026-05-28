import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, act } from '@testing-library/react';

// Mock the router
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock view-routes
vi.mock('@/lib/view-routes', () => ({
  viewToPath: (v: string) => `/${v === 'recycleBin' ? 'trash' : v}`,
}));

// Mock the store
const mockCloseLightbox = vi.fn();

vi.mock('@/stores/app-store', () => ({
  useAppStore: vi.fn(),
}));

import { useAppStore } from '@/stores/app-store';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';

// Component wrapper that calls the hook at the top level (during render)
function ShortcutsWrapper() {
  useKeyboardShortcuts();
  return createElement('div', { 'data-testid': 'shortcuts-wrapper' });
}

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector?: (state: any) => any) => {
        const state = {
          closeLightbox: mockCloseLightbox,
          lightboxOpen: false,
        };
        return selector ? selector(state) : state;
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function fireKeyDown(key: string, ctrlKey = false, metaKey = false, target?: HTMLElement) {
    const el = target || document.body;
    const event = new KeyboardEvent('keydown', {
      key,
      ctrlKey,
      metaKey,
      bubbles: true,
    });
    el.dispatchEvent(event);
  }

  it('Ctrl+K → navigate to /search', () => {
    render(createElement(ShortcutsWrapper));
    fireKeyDown('k', true);
    expect(mockPush).toHaveBeenCalledWith('/search');
  });

  it('Ctrl+N → navigate to /files', () => {
    render(createElement(ShortcutsWrapper));
    fireKeyDown('n', true);
    expect(mockPush).toHaveBeenCalledWith('/files');
  });

  it('Ctrl+D → navigate to /dashboard', () => {
    render(createElement(ShortcutsWrapper));
    fireKeyDown('d', true);
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('Ctrl+F → navigate to /favorites', () => {
    render(createElement(ShortcutsWrapper));
    fireKeyDown('f', true);
    expect(mockPush).toHaveBeenCalledWith('/favorites');
  });

  it('Ctrl+T → navigate to /timeline', () => {
    render(createElement(ShortcutsWrapper));
    fireKeyDown('t', true);
    expect(mockPush).toHaveBeenCalledWith('/timeline');
  });

  it('number keys 1-7 → correct routes', () => {
    render(createElement(ShortcutsWrapper));

    const keyRouteMap: Record<string, string> = {
      '1': '/dashboard',
      '2': '/files',
      '3': '/favorites',
      '4': '/timeline',
      '5': '/search',
      '6': '/trash',
      '7': '/settings',
    };

    for (const [key, route] of Object.entries(keyRouteMap)) {
      mockPush.mockClear();
      fireKeyDown(key);
      expect(mockPush).toHaveBeenCalledWith(route);
    }
  });

  it('Escape when lightboxOpen → closeLightbox', () => {
    (useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector?: (state: any) => any) => {
        const state = {
          closeLightbox: mockCloseLightbox,
          lightboxOpen: true,
        };
        return selector ? selector(state) : state;
      }
    );

    render(createElement(ShortcutsWrapper));
    fireKeyDown('Escape');
    expect(mockCloseLightbox).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalledWith('/dashboard');
  });

  it('Escape when lightbox closed → dashboard', () => {
    (useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector?: (state: any) => any) => {
        const state = {
          closeLightbox: mockCloseLightbox,
          lightboxOpen: false,
        };
        return selector ? selector(state) : state;
      }
    );

    render(createElement(ShortcutsWrapper));
    fireKeyDown('Escape');
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
    expect(mockCloseLightbox).not.toHaveBeenCalled();
  });

  it('shortcuts NOT fired when focused on input', () => {
    render(createElement(ShortcutsWrapper));

    const input = document.createElement('input');
    document.body.appendChild(input);

    // Ctrl+K should still work on input (it's special-cased to work)
    mockPush.mockClear();
    fireKeyDown('k', true, false, input);
    expect(mockPush).toHaveBeenCalledWith('/search');

    // Other shortcuts should NOT work on input
    mockPush.mockClear();
    fireKeyDown('n', true, false, input);
    expect(mockPush).not.toHaveBeenCalledWith('/files');

    // Number keys should NOT work on input
    mockPush.mockClear();
    fireKeyDown('1', false, false, input);
    expect(mockPush).not.toHaveBeenCalledWith('/dashboard');

    document.body.removeChild(input);
  });

  it('shortcuts NOT fired when focused on textarea', () => {
    render(createElement(ShortcutsWrapper));

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    mockPush.mockClear();
    fireKeyDown('d', true, false, textarea);
    expect(mockPush).not.toHaveBeenCalledWith('/dashboard');

    mockPush.mockClear();
    fireKeyDown('3', false, false, textarea);
    expect(mockPush).not.toHaveBeenCalledWith('/favorites');

    document.body.removeChild(textarea);
  });
});
