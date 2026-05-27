import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renders with default variant', () => {
    render(createElement(Button, { children: 'Click me' }));
    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
    expect(button.tagName).toBe('BUTTON');
  });

  it('renders with destructive variant', () => {
    render(
      createElement(Button, { variant: 'destructive', children: 'Delete' })
    );
    const button = screen.getByRole('button', { name: /delete/i });
    expect(button).toBeInTheDocument();
    // Should have the destructive class
    expect(button.className).toContain('destructive');
  });

  it('renders with outline variant', () => {
    render(
      createElement(Button, { variant: 'outline', children: 'Outline' })
    );
    const button = screen.getByRole('button', { name: /outline/i });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain('outline');
  });

  it('renders with ghost variant', () => {
    render(
      createElement(Button, { variant: 'ghost', children: 'Ghost' })
    );
    const button = screen.getByRole('button', { name: /ghost/i });
    expect(button).toBeInTheDocument();
    // ghost variant produces hover:bg-accent classes
    expect(button.className).toContain('hover:bg-accent');
  });

  it('renders with different sizes', () => {
    const { rerender } = render(
      createElement(Button, { size: 'sm', children: 'Small' })
    );
    expect(screen.getByRole('button', { name: /small/i })).toBeInTheDocument();

    rerender(createElement(Button, { size: 'lg', children: 'Large' }));
    expect(screen.getByRole('button', { name: /large/i })).toBeInTheDocument();

    rerender(createElement(Button, { size: 'icon', children: '📋' }));
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('is clickable', () => {
    const onClick = vi.fn();
    render(createElement(Button, { onClick, children: 'Click me' }));
    const button = screen.getByRole('button', { name: /click me/i });

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disabled state prevents clicks', () => {
    const onClick = vi.fn();
    render(createElement(Button, { onClick, disabled: true, children: 'Disabled' }));
    const button = screen.getByRole('button', { name: /disabled/i });

    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies custom className', () => {
    render(
      createElement(Button, {
        className: 'my-custom-class',
        children: 'Styled',
      })
    );
    const button = screen.getByRole('button', { name: /styled/i });
    expect(button.className).toContain('my-custom-class');
  });

  it('renders as child with Slot when asChild is true', () => {
    render(
      createElement(
        Button,
        { asChild: true },
        createElement('a', { href: '#' }, 'Link Button')
      )
    );
    // Should render as an anchor, not a button
    const link = screen.getByRole('link', { name: /link button/i });
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe('A');
  });
});
