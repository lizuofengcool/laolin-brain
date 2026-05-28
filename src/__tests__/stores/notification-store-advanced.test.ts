import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock app-store before importing notification-store
vi.mock('@/stores/app-store', () => ({
  useAppStore: {
    getState: vi.fn().mockReturnValue({
      user: { id: 'test-user-id' },
    }),
  },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get _store() { return store; },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

import { useNotificationStore } from '@/stores/notification-store';

describe('notification-store - advanced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorageMock.clear();
    // Reset the store state
    useNotificationStore.setState({ notifications: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── dismissNotification ──────────────────────────────────

  describe('dismissNotification', () => {
    it('removes a notification by id', () => {
      const id = useNotificationStore.getState().addNotification({
        type: 'success',
        title: 'Test',
        autoDismiss: false,
      });

      expect(useNotificationStore.getState().notifications.length).toBe(1);

      useNotificationStore.getState().dismissNotification(id);
      expect(useNotificationStore.getState().notifications.length).toBe(0);
    });

    it('does nothing when dismissing non-existent id', () => {
      useNotificationStore.getState().addNotification({
        type: 'info',
        title: 'Existing',
        autoDismiss: false,
      });

      useNotificationStore.getState().dismissNotification('non-existent-id');
      expect(useNotificationStore.getState().notifications.length).toBe(1);
    });

    it('dismisses correct notification among multiple', () => {
      const id1 = useNotificationStore.getState().addNotification({
        type: 'success', title: 'First', autoDismiss: false,
      });
      const id2 = useNotificationStore.getState().addNotification({
        type: 'error', title: 'Second', autoDismiss: false,
      });
      const id3 = useNotificationStore.getState().addNotification({
        type: 'info', title: 'Third', autoDismiss: false,
      });

      useNotificationStore.getState().dismissNotification(id2);
      const remaining = useNotificationStore.getState().notifications.map(n => n.id);
      expect(remaining).not.toContain(id2);
      expect(remaining).toContain(id1);
      expect(remaining).toContain(id3);
    });
  });

  // ─── Auto-dismiss timer (lines 92-95) ────────────────────

  describe('autoDismiss', () => {
    it('auto-dismisses notification after default 5000ms', () => {
      const id = useNotificationStore.getState().addNotification({
        type: 'success',
        title: 'Auto dismiss test',
      });

      expect(useNotificationStore.getState().notifications.length).toBe(1);

      // Advance just before timeout
      vi.advanceTimersByTime(4999);
      expect(useNotificationStore.getState().notifications.length).toBe(1);

      // At 5000ms, the notification should be dismissed
      vi.advanceTimersByTime(1);
      expect(useNotificationStore.getState().notifications.length).toBe(0);
    });

    it('auto-dismisses with custom duration', () => {
      const id = useNotificationStore.getState().addNotification({
        type: 'info',
        title: 'Custom duration',
        duration: 2000,
      });

      vi.advanceTimersByTime(1999);
      expect(useNotificationStore.getState().notifications.length).toBe(1);

      vi.advanceTimersByTime(1);
      expect(useNotificationStore.getState().notifications.length).toBe(0);
    });

    it('does not auto-dismiss when autoDismiss is false', () => {
      useNotificationStore.getState().addNotification({
        type: 'warning',
        title: 'Persistent notification',
        autoDismiss: false,
      });

      vi.advanceTimersByTime(100_000); // 100 seconds
      expect(useNotificationStore.getState().notifications.length).toBe(1);
    });

    it('sets setTimeout with correct duration', () => {
      const timerSpy = vi.spyOn(globalThis, 'setTimeout');
      useNotificationStore.getState().addNotification({
        type: 'success',
        title: 'Timer check',
        duration: 3000,
      });

      expect(timerSpy).toHaveBeenCalledWith(expect.any(Function), 3000);
      timerSpy.mockRestore();
    });
  });

  // ─── clearAll ─────────────────────────────────────────────

  describe('clearAll', () => {
    it('removes all notifications', () => {
      useNotificationStore.getState().addNotification({ type: 'success', title: 'A', autoDismiss: false });
      useNotificationStore.getState().addNotification({ type: 'error', title: 'B', autoDismiss: false });
      useNotificationStore.getState().addNotification({ type: 'info', title: 'C', autoDismiss: false });

      expect(useNotificationStore.getState().notifications.length).toBe(3);

      useNotificationStore.getState().clearAll();
      expect(useNotificationStore.getState().notifications.length).toBe(0);
    });

    it('clears empty state without error', () => {
      useNotificationStore.getState().clearAll();
      expect(useNotificationStore.getState().notifications.length).toBe(0);
    });

    it('persists empty array to localStorage', () => {
      useNotificationStore.getState().addNotification({ type: 'success', title: 'X', autoDismiss: false });
      useNotificationStore.getState().clearAll();

      // Check localStorage was called with empty array
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        expect.stringContaining('kb_notifications'),
        '[]'
      );
    });
  });

  // ─── markAsRead ──────────────────────────────────────────

  describe('markAsRead', () => {
    it('marks a notification as read', () => {
      const id = useNotificationStore.getState().addNotification({
        type: 'info',
        title: 'Unread',
        autoDismiss: false,
      });

      expect(useNotificationStore.getState().notifications[0].read).toBe(false);

      useNotificationStore.getState().markAsRead(id);
      expect(useNotificationStore.getState().notifications[0].read).toBe(true);
    });

    it('does nothing for non-existent id', () => {
      useNotificationStore.getState().addNotification({
        type: 'info', title: 'Test', autoDismiss: false,
      });

      const before = useNotificationStore.getState().notifications.length;
      useNotificationStore.getState().markAsRead('non-existent');
      expect(useNotificationStore.getState().notifications.length).toBe(before);
    });
  });

  // ─── markAllAsRead ───────────────────────────────────────

  describe('markAllAsRead', () => {
    it('marks all notifications as read', () => {
      useNotificationStore.getState().addNotification({ type: 'success', title: 'A', autoDismiss: false });
      useNotificationStore.getState().addNotification({ type: 'error', title: 'B', autoDismiss: false });

      useNotificationStore.getState().markAllAsRead();

      const allRead = useNotificationStore.getState().notifications.every(n => n.read);
      expect(allRead).toBe(true);
    });
  });

  // ─── getUnreadCount ──────────────────────────────────────

  describe('getUnreadCount', () => {
    it('returns 0 when no notifications', () => {
      expect(useNotificationStore.getState().getUnreadCount()).toBe(0);
    });

    it('returns correct unread count', () => {
      const id1 = useNotificationStore.getState().addNotification({
        type: 'info', title: 'Unread 1', autoDismiss: false,
      });
      useNotificationStore.getState().addNotification({
        type: 'info', title: 'Unread 2', autoDismiss: false,
      });

      expect(useNotificationStore.getState().getUnreadCount()).toBe(2);

      useNotificationStore.getState().markAsRead(id1);
      expect(useNotificationStore.getState().getUnreadCount()).toBe(1);
    });
  });

  // ─── MAX_NOTIFICATIONS limit ─────────────────────────────

  describe('MAX_NOTIFICATIONS limit (50)', () => {
    it('enforces maximum 50 notifications', () => {
      for (let i = 0; i < 55; i++) {
        useNotificationStore.getState().addNotification({
          type: 'info',
          title: `Notification ${i}`,
          autoDismiss: false,
        });
      }

      expect(useNotificationStore.getState().notifications.length).toBe(50);
    });

    it('keeps most recent notifications when limit exceeded', () => {
      for (let i = 0; i < 55; i++) {
        useNotificationStore.getState().addNotification({
          type: 'info',
          title: `N${i}`,
          autoDismiss: false,
        });
      }

      const titles = useNotificationStore.getState().notifications.map(n => n.title);
      // First 5 should be gone, most recent 50 remain
      expect(titles).not.toContain('N0');
      expect(titles).not.toContain('N4');
      expect(titles).toContain('N5');
      expect(titles).toContain('N54');
    });
  });

  // ─── Persistence to localStorage ─────────────────────────

  describe('localStorage persistence', () => {
    it('saves notifications to localStorage on add', () => {
      useNotificationStore.getState().addNotification({
        type: 'success',
        title: 'Persisted',
        autoDismiss: false,
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        expect.stringContaining('kb_notifications'),
        expect.any(String)
      );
    });

    it('saves to user-scoped key', () => {
      useNotificationStore.getState().addNotification({
        type: 'info', title: 'Scoped', autoDismiss: false,
      });

      const setCalls = localStorageMock.setItem.mock.calls;
      const key = setCalls[setCalls.length - 1][0];
      expect(key).toContain('test-user-id');
    });

    it('truncates to MAX_NOTIFICATIONS when saving', () => {
      for (let i = 0; i < 55; i++) {
        useNotificationStore.getState().addNotification({
          type: 'info', title: `N${i}`, autoDismiss: false,
        });
      }

      // Get the last call to setItem
      const lastCall = localStorageMock.setItem.mock.calls[localStorageMock.setItem.mock.calls.length - 1];
      const saved = JSON.parse(lastCall[1]);
      expect(saved.length).toBeLessThanOrEqual(50);
    });
  });

  // ─── Notification with all fields ────────────────────────

  describe('notification fields', () => {
    it('creates notification with message and action', () => {
      const id = useNotificationStore.getState().addNotification({
        type: 'warning',
        title: 'Warning Title',
        message: 'Detailed warning message',
        action: { label: 'Undo' },
        autoDismiss: false,
      });

      const notif = useNotificationStore.getState().notifications.find(n => n.id === id);
      expect(notif).toBeDefined();
      expect(notif!.title).toBe('Warning Title');
      expect(notif!.message).toBe('Detailed warning message');
      expect(notif!.action).toEqual({ label: 'Undo' });
      expect(notif!.type).toBe('warning');
      expect(notif!.read).toBe(false);
      expect(notif!.timestamp).toBeTypeOf('number');
    });

    it('creates notification with all 4 types', () => {
      const types = ['success', 'error', 'info', 'warning'] as const;
      for (const type of types) {
        const id = useNotificationStore.getState().addNotification({
          type,
          title: `${type} notification`,
          autoDismiss: false,
        });
        const notif = useNotificationStore.getState().notifications.find(n => n.id === id);
        expect(notif!.type).toBe(type);
      }
    });
  });

  // ─── addNotification return value ────────────────────────

  describe('addNotification return value', () => {
    it('returns a string id', () => {
      const id = useNotificationStore.getState().addNotification({
        type: 'info', title: 'Test', autoDismiss: false,
      });
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('returns unique ids for each notification', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const id = useNotificationStore.getState().addNotification({
          type: 'info', title: `N${i}`, autoDismiss: false,
        });
        ids.add(id);
      }
      expect(ids.size).toBe(10);
    });
  });
});
