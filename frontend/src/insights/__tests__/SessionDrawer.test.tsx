import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SessionDrawer } from '../SessionDrawer';
import * as api from '../api';
import type { SessionDetail } from '../../types';

vi.mock('../api');

const detail: SessionDetail = {
  meta: {
    id: 's1', title: 'Do the thing', model: 'grok-4.3',
    message_count: 4, tool_call_count: 1, input_tokens: 100, output_tokens: 20,
    cost_usd: 0.0123, started_at: 1782733018.39, ended_at: null, end_reason: '',
  },
  messages: [
    { role: 'user', text: 'do the thing', tools: [], tool_name: '', result: '', truncated: false },
    { role: 'assistant', text: '', tools: ['kanban_list'], tool_name: '', result: '', truncated: false },
    { role: 'tool', text: '', tools: [], tool_name: 'kanban_list', result: '{"tasks": []}', truncated: false },
    { role: 'assistant', text: 'Done.', tools: [], tool_name: '', result: '', truncated: false },
  ],
};

beforeEach(() => vi.mocked(api.fetchSession).mockReset());

describe('SessionDrawer', () => {
  it('renders the header stats and transcript', async () => {
    vi.mocked(api.fetchSession).mockResolvedValue(detail);
    render(<SessionDrawer instance="local" sessionId="s1" onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText('Done.')).toBeInTheDocument());
    expect(screen.getByText('grok-4.3')).toBeInTheDocument();   // model stat
    expect(screen.getByText('$0.01')).toBeInTheDocument();      // cost
    expect(screen.getByText('do the thing')).toBeInTheDocument();
    expect(screen.getByText('kanban_list')).toBeInTheDocument(); // assistant tool chip
    expect(screen.getByText(/kanban_list result/)).toBeInTheDocument(); // collapsed tool row
  });

  it('flags truncated tool results', async () => {
    const trunc: SessionDetail = {
      ...detail,
      messages: [
        { role: 'tool', text: '', tools: [], tool_name: 'read_file', result: 'x'.repeat(40) + '…', truncated: true },
      ],
    };
    vi.mocked(api.fetchSession).mockResolvedValue(trunc);
    render(<SessionDrawer instance="local" sessionId="s1" onClose={() => {}} />);
    expect(await screen.findByText(/read_file result \(truncated\)/)).toBeInTheDocument();
  });
});
