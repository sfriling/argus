import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Tabs } from '../Tabs';

describe('Tabs', () => {
  it('renders all four tabs', () => {
    render(<Tabs active="summary" onSelect={() => {}} />);
    ['Summary', 'Fleet', 'Agents', 'Insights'].forEach((t) =>
      expect(screen.getByText(t)).toBeInTheDocument(),
    );
  });

  it('marks the active tab', () => {
    render(<Tabs active="fleet" onSelect={() => {}} />);
    expect(screen.getByText('Fleet').closest('button')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Summary').closest('button')).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onSelect with the tab key', () => {
    const onSelect = vi.fn();
    render(<Tabs active="summary" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Insights'));
    expect(onSelect).toHaveBeenCalledWith('insights');
  });
});
