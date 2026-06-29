import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AddTaskModal } from '../AddTaskModal';

function renderModal() {
  const onCreate = vi.fn();
  render(<AddTaskModal profiles={['executor', 'planner']} onCreate={onCreate} onClose={() => {}} />);
  return onCreate;
}

describe('AddTaskModal', () => {
  it('disables Add until a title is entered', () => {
    renderModal();
    expect(screen.getByText('Add task').closest('button')).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/needs doing/i), { target: { value: 'New task' } });
    expect(screen.getByText('Add task').closest('button')).not.toBeDisabled();
  });

  it('defaults to unassigned (staged) and creates with the title', () => {
    const onCreate = renderModal();
    fireEvent.change(screen.getByPlaceholderText(/needs doing/i), { target: { value: 'New task' } });
    fireEvent.click(screen.getByText('Add task'));
    expect(onCreate).toHaveBeenCalledWith({ title: 'New task', body: undefined, assignee: undefined });
  });

  it('passes a chosen assignee through', () => {
    const onCreate = renderModal();
    fireEvent.change(screen.getByPlaceholderText(/needs doing/i), { target: { value: 'Run now' } });
    fireEvent.change(screen.getByDisplayValue(/unassigned/i), { target: { value: 'executor' } });
    fireEvent.click(screen.getByText('Add task'));
    expect(onCreate).toHaveBeenCalledWith({ title: 'Run now', body: undefined, assignee: 'executor' });
  });
});
