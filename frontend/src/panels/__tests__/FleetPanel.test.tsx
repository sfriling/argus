import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FleetPanel } from '../FleetPanel';
import { sampleOverview, sampleOverviewDegraded } from '../../sample';

describe('FleetPanel', () => {
  it('renders all instance names', () => {
    render(<FleetPanel instances={sampleOverview.instances} />);
    // Name "local" appears as both the instance name label and transport badge
    expect(screen.getAllByText('local').length).toBeGreaterThan(0);
    expect(screen.getAllByText('vps').length).toBeGreaterThan(0);
  });

  it('shows gateway detail for reachable instances', () => {
    render(<FleetPanel instances={sampleOverview.instances} />);
    expect(screen.getByText('Listening on :7700')).toBeInTheDocument();
  });

  it('shows in-flight count for each instance', () => {
    render(<FleetPanel instances={sampleOverview.instances} />);
    // local: ready=3 + running=2 = 5; vps: ready=1 + running=1 = 2
    const fiveEl = screen.getAllByText('5');
    expect(fiveEl.length).toBeGreaterThan(0);
  });

  it('shows transport badge "ssh" for vps', () => {
    render(<FleetPanel instances={sampleOverview.instances} />);
    // "ssh" transport badge only appears on the vps card
    expect(screen.getByText('ssh')).toBeInTheDocument();
  });

  it('shows dispatcher status', () => {
    render(<FleetPanel instances={sampleOverview.instances} />);
    expect(screen.getAllByText('Running').length).toBeGreaterThan(0);
  });

  it('shows active profile name', () => {
    render(<FleetPanel instances={sampleOverview.instances} />);
    expect(screen.getByText('research')).toBeInTheDocument();
    expect(screen.getByText('coding')).toBeInTheDocument();
  });

  describe('degraded state', () => {
    it('shows degraded badge when vps is unreachable', () => {
      render(<FleetPanel instances={sampleOverviewDegraded.instances} />);
      expect(screen.getByText('degraded')).toBeInTheDocument();
    });

    it('shows the error message for the unreachable instance', () => {
      render(<FleetPanel instances={sampleOverviewDegraded.instances} />);
      expect(
        screen.getByTestId('instance-error-vps')
      ).toHaveTextContent('ssh timeout');
    });

    it('still shows the local instance as normal', () => {
      render(<FleetPanel instances={sampleOverviewDegraded.instances} />);
      const localCard = screen.getByTestId('instance-card-local');
      expect(localCard).not.toHaveClass('opacity-50');
    });

    it('makes the degraded card visually muted', () => {
      render(<FleetPanel instances={sampleOverviewDegraded.instances} />);
      const vpsCard = screen.getByTestId('instance-card-vps');
      expect(vpsCard).toHaveClass('opacity-50');
    });
  });
});
