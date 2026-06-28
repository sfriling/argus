import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProfilesPanel } from '../ProfilesPanel';
import { sampleOverview } from '../../sample';

describe('ProfilesPanel', () => {
  it('renders "Profiles" section heading', () => {
    render(<ProfilesPanel instances={sampleOverview.instances} />);
    expect(screen.getByText('Profiles')).toBeInTheDocument();
  });

  it('renders instance names', () => {
    render(<ProfilesPanel instances={sampleOverview.instances} />);
    expect(screen.getAllByText('local').length).toBeGreaterThan(0);
    expect(screen.getAllByText('vps').length).toBeGreaterThan(0);
  });

  it('renders all profile chips across instances', () => {
    render(<ProfilesPanel instances={sampleOverview.instances} />);
    // local: research (active), coding, minimal; vps: coding (active), research
    // 'research' appears in local and vps, 'coding' appears in local and vps
    expect(screen.getAllByText('research').length).toBeGreaterThan(0);
    expect(screen.getAllByText('coding').length).toBeGreaterThan(0);
    // 'minimal' only appears once (local)
    expect(screen.getByText('minimal')).toBeInTheDocument();
  });

  it('renders the correct number of profile chip groups', () => {
    const { container } = render(
      <ProfilesPanel instances={sampleOverview.instances} />
    );
    // Two instance cards
    const cards = container.querySelectorAll('.rounded-xl');
    expect(cards.length).toBe(2);
  });

  it('has active profile chips with dot indicators', () => {
    const { container } = render(
      <ProfilesPanel instances={sampleOverview.instances} />
    );
    // Active chips contain a dot span inside them
    // There should be 2 active chips (one per instance)
    const dotSpans = container.querySelectorAll(
      '.inline-flex .w-1\\.5.h-1\\.5.rounded-full'
    );
    expect(dotSpans.length).toBeGreaterThanOrEqual(2);
  });
});
