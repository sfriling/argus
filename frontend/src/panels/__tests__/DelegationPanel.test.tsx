import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DelegationPanel } from '../DelegationPanel';
import { sampleOverview } from '../../sample';

describe('DelegationPanel', () => {
  it('renders instance names', () => {
    render(<DelegationPanel instances={sampleOverview.instances} />);
    expect(screen.getAllByText('local').length).toBeGreaterThan(0);
    expect(screen.getAllByText('vps').length).toBeGreaterThan(0);
  });

  it('renders kanban count chips', () => {
    render(<DelegationPanel instances={sampleOverview.instances} />);
    expect(screen.getAllByText('ready').length).toBeGreaterThan(0);
    expect(screen.getAllByText('running').length).toBeGreaterThan(0);
    expect(screen.getAllByText('blocked').length).toBeGreaterThan(0);
    expect(screen.getAllByText('done').length).toBeGreaterThan(0);
  });

  it('shows in-flight task titles', () => {
    render(<DelegationPanel instances={sampleOverview.instances} />);
    expect(
      screen.getByText('Summarise Q2 financial reports')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Refactor auth middleware')
    ).toBeInTheDocument();
  });

  it('shows task IDs', () => {
    render(<DelegationPanel instances={sampleOverview.instances} />);
    expect(screen.getByText('task-042')).toBeInTheDocument();
    expect(screen.getByText('task-091')).toBeInTheDocument();
  });

  it('shows status badges on tasks', () => {
    render(<DelegationPanel instances={sampleOverview.instances} />);
    const runningBadges = screen.getAllByText('running');
    expect(runningBadges.length).toBeGreaterThan(0);
  });

  it('shows "In Flight" section label', () => {
    render(<DelegationPanel instances={sampleOverview.instances} />);
    expect(screen.getAllByText('In Flight').length).toBeGreaterThan(0);
  });
});
