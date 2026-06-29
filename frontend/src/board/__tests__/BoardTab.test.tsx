import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { BoardTab } from '../BoardTab';
import * as api from '../api';

vi.mock('../api');

function board(writable: boolean) {
  return {
    tasks: [
      { id: 't1', title: 'Write the docs', status: 'ready', assignee: 'planner' },
      { id: 't2', title: 'Ship it', status: 'running', assignee: 'executor' },
    ],
    meta: { instance: 'local', writable, actions_enabled: writable, profiles: ['executor', 'planner'] },
  };
}

beforeEach(() => {
  vi.mocked(api.fetchBoard).mockReset();
});

describe('BoardTab', () => {
  it('renders columns and tasks from the board', async () => {
    vi.mocked(api.fetchBoard).mockResolvedValue(board(true));
    render(<BoardTab instances={['local']} />);
    await waitFor(() => expect(screen.getByText('Write the docs')).toBeInTheDocument());
    expect(screen.getByText('Ship it')).toBeInTheDocument();
    expect(screen.getByText('Todo')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('shows read-only and disables Add when actions are off', async () => {
    vi.mocked(api.fetchBoard).mockResolvedValue(board(false));
    render(<BoardTab instances={['local']} />);
    await waitFor(() => expect(screen.getByText('read-only')).toBeInTheDocument());
    expect(screen.getByText('+ Add task').closest('button')).toBeDisabled();
  });

  it('enables Add when writable', async () => {
    vi.mocked(api.fetchBoard).mockResolvedValue(board(true));
    render(<BoardTab instances={['local']} />);
    await waitFor(() => expect(screen.getByText('Write the docs')).toBeInTheDocument());
    expect(screen.getByText('+ Add task').closest('button')).not.toBeDisabled();
  });
});
