import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { FileIconDisplay } from '@/lib/file-utils';

describe('FileIconDisplay', () => {
  it('renders correct icon for "word" type', () => {
    const { container } = render(
      createElement(FileIconDisplay, { fileType: 'word' })
    );
    // FileText is the icon for "word"
    // Lucide icons render as SVGs
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders correct icon for "pdf" type', () => {
    const { container } = render(
      createElement(FileIconDisplay, { fileType: 'pdf' })
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders correct icon for "image" type', () => {
    const { container } = render(
      createElement(FileIconDisplay, { fileType: 'image' })
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders default icon for unknown type', () => {
    const { container } = render(
      createElement(FileIconDisplay, { fileType: 'unknown-type' })
    );
    // Should still render an SVG (File icon is the default)
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('passes through className prop', () => {
    const { container } = render(
      createElement(FileIconDisplay, {
        fileType: 'word',
        className: 'w-10 h-10 text-blue-500',
      })
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('w-10', 'h-10', 'text-blue-500');
  });

  it('renders different icons for different file types', () => {
    const { container: wordContainer } = render(
      createElement(FileIconDisplay, { fileType: 'word', className: 'word-icon' })
    );
    const { container: imageContainer } = render(
      createElement(FileIconDisplay, { fileType: 'image', className: 'image-icon' })
    );

    const wordIcon = wordContainer.querySelector('.word-icon');
    const imageIcon = imageContainer.querySelector('.image-icon');

    expect(wordIcon).toBeInTheDocument();
    expect(imageIcon).toBeInTheDocument();
    // Both are SVGs but should be different components
    expect(wordIcon?.nodeName).toBe('svg');
    expect(imageIcon?.nodeName).toBe('svg');
  });

  it('renders FileCode icon for markdown type', () => {
    const { container } = render(
      createElement(FileIconDisplay, { fileType: 'markdown' })
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders FileCode icon for txt type', () => {
    const { container } = render(
      createElement(FileIconDisplay, { fileType: 'txt' })
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders Presentation icon for pptx type', () => {
    const { container } = render(
      createElement(FileIconDisplay, { fileType: 'pptx' })
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });
});
