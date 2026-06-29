import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ClaudeAgentsPanel } from '../ClaudeAgentsPanel';
import { sampleOverview } from '../../sample';

const agents = sampleOverview.claude_agents;

describe('ClaudeAgentsPanel', () => {
  it('renders the active agent name', () => {
    render(<ClaudeAgentsPanel agents={agents} />);
    expect(
      screen.getByText('Improve Hermes agent task execution reliability'),
    ).toBeInTheDocument();
  });

  it('shows a "running" badge for a live, busy agent', () => {
    render(<ClaudeAgentsPanel agents={agents} />);
    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('renders recent (done) agents under a Recent header', () => {
    render(<ClaudeAgentsPanel agents={agents} />);
    expect(screen.getByText('Recent')).toBeInTheDocument();
    expect(screen.getByText('Demo new local build capabilities')).toBeInTheDocument();
    expect(screen.getByText('Upscaler')).toBeInTheDocument();
  });

  it('renders model and token info', () => {
    render(<ClaudeAgentsPanel agents={agents} />);
    expect(screen.getAllByText('opus').length).toBeGreaterThan(0);
    expect(screen.getByText('709.3K tok')).toBeInTheDocument();
  });

  it('renders nothing when there are no agents', () => {
    const { container } = render(<ClaudeAgentsPanel agents={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
