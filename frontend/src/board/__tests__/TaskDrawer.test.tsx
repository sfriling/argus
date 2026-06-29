import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { TaskDrawer } from '../TaskDrawer';
import * as api from '../api';
import type { BoardTask } from '../../types';

vi.mock('../api');

const task: BoardTask = {
  id: 't_1', title: 'Ship it', status: 'running', assignee: 'executor', body: 'do the thing',
};

beforeEach(() => {
  vi.mocked(api.fetchTask).mockResolvedValue({ ...task, comments: [] } as never);
});

function renderDrawer(over: Partial<Parameters<typeof TaskDrawer>[0]> = {}) {
  const onAction = vi.fn();
  render(
    <TaskDrawer
      instance="local"
      task={task}
      writable
      profiles={['executor', 'planner']}
      onAction={onAction}
      onClose={() => {}}
      {...over}
    />,
  );
  return onAction;
}

describe('TaskDrawer', () => {
  it('renders the task title and body', async () => {
    renderDrawer();
    expect(screen.getByText('Ship it')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('do the thing')).toBeInTheDocument());
  });

  it('fires a contextual transition (running → Complete)', () => {
    const onAction = renderDrawer();
    fireEvent.click(screen.getByText('Complete'));     // cardActions('running') = ['complete']
    expect(onAction).toHaveBeenCalledWith('complete');
  });

  it('sends a comment with its body', () => {
    const onAction = renderDrawer();
    fireEvent.change(screen.getByPlaceholderText(/Add a comment/), { target: { value: 'looks good' } });
    fireEvent.click(screen.getByText('Send'));
    expect(onAction).toHaveBeenCalledWith('comment', { body: 'looks good' });
  });

  it('archives only after a confirm step', () => {
    const onAction = renderDrawer();
    fireEvent.click(screen.getByText('Archive'));
    expect(onAction).not.toHaveBeenCalled();           // confirm first
    fireEvent.click(screen.getByText('Yes'));
    expect(onAction).toHaveBeenCalledWith('archive');
  });

  it('is read-only when not writable', () => {
    renderDrawer({ writable: false });
    expect(screen.queryByText('Send')).not.toBeInTheDocument();
    expect(screen.getByText(/enable_actions/)).toBeInTheDocument();
  });
});
