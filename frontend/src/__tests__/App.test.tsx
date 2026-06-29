import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { sampleOverview } from '../sample';

vi.mock('../useOverview', () => ({
  useOverview: () => ({ data: sampleOverview, stale: false, lastUpdated: new Date(0) }),
}));

import App from '../App';

describe('App tabbed navigation', () => {
  it('lands on the Summary view by default', () => {
    render(<App />);
    expect(screen.getByText('Live Now')).toBeInTheDocument();
  });

  it('hides the Review tab unless skill review is available', () => {
    render(<App />);   // sample overview has no features.skill_review
    expect(screen.queryByRole('tab', { name: 'Review' })).not.toBeInTheDocument();
  });

  it('switches to the Fleet tab', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Fleet' }));
    expect(screen.queryByText('Live Now')).not.toBeInTheDocument();
    expect(screen.getByText('Crons')).toBeInTheDocument();       // CronsPanel lives under Fleet
  });

  it('switches to the Agents tab', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Agents' }));
    expect(screen.getByText('Claude Agents')).toBeInTheDocument();
  });

  it('switches to the Insights tab', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Insights' }));
    expect(screen.getByText('Usage')).toBeInTheDocument();
    expect(screen.getByText('Recent Sessions')).toBeInTheDocument();
  });
});
