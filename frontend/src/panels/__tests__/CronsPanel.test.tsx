import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CronsPanel } from '../CronsPanel';
import { sampleOverview } from '../../sample';

describe('CronsPanel', () => {
  it('renders cron names', () => {
    render(<CronsPanel instances={sampleOverview.instances} />);
    expect(screen.getAllByText('Vault Health Check').length).toBeGreaterThan(0);
    expect(screen.getByText('Weekly Digest')).toBeInTheDocument();
    expect(screen.getByText('Log Rotation')).toBeInTheDocument();
  });

  it('renders schedule strings', () => {
    render(<CronsPanel instances={sampleOverview.instances} />);
    expect(screen.getAllByText('0 9 * * 4').length).toBeGreaterThan(0);
    expect(screen.getByText('0 8 * * 1')).toBeInTheDocument();
  });

  it('renders status badges', () => {
    render(<CronsPanel instances={sampleOverview.instances} />);
    expect(screen.getAllByText('ok').length).toBeGreaterThan(0);
    expect(screen.getAllByText('error').length).toBeGreaterThan(0);
  });

  it('renders table headers', () => {
    render(<CronsPanel instances={sampleOverview.instances} />);
    expect(screen.getAllByText('Name').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Schedule').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Next Run').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Last Status').length).toBeGreaterThan(0);
  });

  it('renders instance names as table section headers', () => {
    render(<CronsPanel instances={sampleOverview.instances} />);
    expect(screen.getAllByText('local').length).toBeGreaterThan(0);
    expect(screen.getAllByText('vps').length).toBeGreaterThan(0);
  });

  it('renders "Dependency Audit" cron for local', () => {
    render(<CronsPanel instances={sampleOverview.instances} />);
    expect(screen.getByText('Dependency Audit')).toBeInTheDocument();
  });
});
