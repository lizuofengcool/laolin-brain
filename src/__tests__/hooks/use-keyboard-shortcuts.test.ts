import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import { createElement } from 'react';

// Mock the store
const mockSetCurrentView = vi.fn();
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
          setCurrentView: mockSetCurrentView,
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

  it('Ctrl+K → setCurrentView("search")', () => {
    render(createElement(ShortcutsWrapper));
    fireKeyDown('k', true);
    expect(mockSetCurrentView).toHaveBeenCalledWith('search');
  });

  it('Ctrl+N → setCurrentView("files")', () => {
    render(createElement(ShortcutsWrapper));
    fireKeyDown('n', true);
    expect(mockSetCurrentView).toHaveBeenCalledWith('files');
  });

  it('Ctrl+D → setCurrentView("dashboard")', () => {
    render(createElement(ShortcutsWrapper));
    fireKeyDown('d', true);
    expect(mockSetCurrentView).toHaveBeenCalledWith('dashboard');
  });

  it('Ctrl+F → setCurrentView("favorites")', () => {
    render(createElement(ShortcutsWrapper));
    fireKeyDown('f', true);
    expect(mockSetCurrentView).toHaveBeenCalledWith('favorites');
  });

  it('Ctrl+T → setCurrentView("timeline")', () => {
    render(createElement(ShortcutsWrapper));
    fireKeyDown('t', true);
    expect(mockSetCurrentView).toHaveBeenCalledWith('timeline');
  });

  it('number keys 1-7 → correct views', () => {
    render(createElement(ShortcutsWrapper));

    const keyViewMap: Record<string, string> = {
      '1': 'dashboard',
      '2': 'files',
      '3': 'favorites',
      '4': 'timeline',
      '5': 'search',
      '6': 'recycleBin',
      '7': 'settings',
    };

    for (const [key, view] of Object.entries(keyViewMap)) {
      mockSetCurrentView.mockClear();
      fireKeyDown(key);
      expect(mockSetCurrentView).toHaveBeenCalledWith(view);
    }
  });

  it('Escape when lightboxOpen → closeLightbox', () => {
    (useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector?: (state: any) => any) => {
        const state = {
          setCurrentView: mockSetCurrentView,
          closeLightbox: mockCloseLightbox,
          lightboxOpen: true,
        };
        return selector ? selector(state) : state;
      }
    );

    render(createElement(ShortcutsWrapper));
    fireKeyDown('Escape');
    expect(mockCloseLightbox).toHaveBeenCalled();
    expect(mockSetCurrentView).not.toHaveBeenCalledWith('dashboard');
  });

  it('Escape when lightbox closed → dashboard', () => {
    (useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector?: (state: any) => any) => {
        const state = {
          setCurrentView: mockSetCurrentView,
          closeLightbox: mockCloseLightbox,
          lightboxOpen: false,
        };
        return selector ? selector(state) : state;
      }
    );

    render(createElement(ShortcutsWrapper));
    fireKeyDown('Escape');
    expect(mockSetCurrentView).toHaveBeenCalledWith('dashboard');
    expect(mockCloseLightbox).not.toHaveBeenCalled();
  });

  it('shortcuts NOT fired when focused on input', () => {
    render(createElement(ShortcutsWrapper));

    const input = document.createElement('input');
    document.body.appendChild(input);

    // Ctrl+K should still work on input (it's special-cased to work)
    mockSetCurrentView.mockClear();
    fireKeyDown('k', true, false, input);
    expect(mockSetCurrentView).toHaveBeenCalledWith('search');

    // Other shortcuts should NOT work on input
    mockSetCurrentView.mockClear();
    fireKeyDown('n', true, false, input);
    expect(mockSetCurrentView).not.toHaveBeenCalledWith('files');

    // Number keys should NOT work on input
    mockSetCurrentView.mockClear();
    fireKeyDown('1', false, false, input);
    expect(mockSetCurrentView).not.toHaveBeenCalledWith('dashboard');

    document.body.removeChild(input);
  });

  it('shortcuts NOT fired when focused on textarea', () => {
    render(createElement(ShortcutsWrapper));

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    mockSetCurrentView.mockClear();
    fireKeyDown('d', true, false, textarea);
    expect(mockSetCurrentView).not.toHaveBeenCalledWith('dashboard');

    mockSetCurrentView.mockClear();
    fireKeyDown('3', false, false, textarea);
    expect(mockSetCurrentView).not.toHaveBeenCalledWith('favorites');

    document.body.removeChild(textarea);
  });
});
