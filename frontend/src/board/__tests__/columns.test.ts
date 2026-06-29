import { describe, it, expect } from 'vitest';
import { columnFor, groupByColumn, dragVerb, cardActions } from '../columns';
import type { BoardTask } from '../../types';

const t = (status: string): BoardTask => ({ id: status, title: status, status });

describe('columnFor', () => {
  it('maps statuses to columns and hides archived', () => {
    expect(columnFor('triage')).toBe('todo');
    expect(columnFor('scheduled')).toBe('ready');
    expect(columnFor('running')).toBe('running');
    expect(columnFor('archived')).toBeNull();
  });
});

describe('groupByColumn', () => {
  it('buckets tasks and drops archived', () => {
    const g = groupByColumn([t('todo'), t('ready'), t('running'), t('archived')]);
    expect(g.todo.length).toBe(1);
    expect(g.ready.length).toBe(1);
    expect(g.running.length).toBe(1);
    expect(Object.values(g).flat().length).toBe(3); // archived excluded
  });
});

describe('dragVerb', () => {
  it('resolves human-valid moves', () => {
    expect(dragVerb('todo', 'ready')).toBe('promote');
    expect(dragVerb('blocked', 'ready')).toBe('unblock');
    expect(dragVerb('ready', 'blocked')).toBe('block');
    expect(dragVerb('running', 'done')).toBe('complete');
  });
  it('rejects agent-driven / nonsense moves and same-column drops', () => {
    expect(dragVerb('ready', 'running')).toBeNull();   // dispatcher's job
    expect(dragVerb('todo', 'review')).toBeNull();
    expect(dragVerb('ready', 'ready')).toBeNull();      // dropped back in place
    expect(dragVerb('scheduled', 'ready')).toBeNull();  // scheduled already maps to Ready col
  });
});

describe('cardActions', () => {
  it('offers contextual transitions by status', () => {
    expect(cardActions('todo')).toEqual(['promote', 'block']);
    expect(cardActions('blocked')).toEqual(['unblock']);
    expect(cardActions('running')).toEqual(['complete']);
    expect(cardActions('done')).toEqual([]);
  });
});
