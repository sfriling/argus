import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FleetMap } from '../FleetMap';
import { sampleOverview } from '../../sample';
import type { Overview } from '../../types';

describe('FleetMap', () => {
  it('renders a hub per instance and the HUD', () => {
    render(<FleetMap overview={sampleOverview} stale={false} onNavigate={() => {}} />);
    expect(screen.getByText('local')).toBeInTheDocument();   // hub label
    expect(screen.getByText('vps')).toBeInTheDocument();
    expect(screen.getAllByText(/in-flight/).length).toBeGreaterThan(0); // HUD + hub captions
    expect(screen.getByText(/active/)).toBeInTheDocument();   // HUD
  });

  it('renders an agent node for each Claude agent', () => {
    const { container } = render(<FleetMap overview={sampleOverview} stale={false} onNavigate={() => {}} />);
    // busy agent gets the pulse class
    expect(container.querySelectorAll('.fleet-agent--busy').length).toBeGreaterThan(0);
  });

  it('shows a calm idle state for an empty fleet', () => {
    const empty: Overview = { generated_at: '', refresh_seconds: 5, instances: [], claude_agents: [] };
    render(<FleetMap overview={empty} stale={false} onNavigate={() => {}} />);
    expect(screen.getByText(/fleet map is idle/)).toBeInTheDocument();
  });
});
