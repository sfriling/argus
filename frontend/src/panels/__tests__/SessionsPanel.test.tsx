import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SessionsPanel } from '../SessionsPanel';
import { sampleOverview } from '../../sample';

describe('SessionsPanel', () => {
  it('renders session titles', () => {
    render(<SessionsPanel instances={sampleOverview.instances} />);
    expect(screen.getByText('Obsidian Vault Broken Links')).toBeInTheDocument();
    expect(screen.getByText('Refactor auth middleware')).toBeInTheDocument();
  });

  it('renders last-active times', () => {
    render(<SessionsPanel instances={sampleOverview.instances} />);
    expect(screen.getByText('just now')).toBeInTheDocument();
    expect(screen.getAllByText('19h ago').length).toBeGreaterThan(0);
  });

  it('flags cron sessions with a badge', () => {
    render(<SessionsPanel instances={sampleOverview.instances} />);
    expect(screen.getByText('cron')).toBeInTheDocument();
  });

  it('shows "Untitled" for empty titles', () => {
    render(<SessionsPanel instances={sampleOverview.instances} />);
    expect(screen.getByText('Untitled')).toBeInTheDocument();
  });

  it('renders instance section headers', () => {
    render(<SessionsPanel instances={sampleOverview.instances} />);
    expect(screen.getAllByText('local').length).toBeGreaterThan(0);
    expect(screen.getAllByText('vps').length).toBeGreaterThan(0);
  });
});
