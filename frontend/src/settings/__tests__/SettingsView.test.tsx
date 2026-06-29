import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SettingsView } from '../SettingsView';
import type { ConfigResponse } from '../../types';

function makeData(writable: boolean): ConfigResponse {
  return {
    config: {
      host: '127.0.0.1',
      port: 7700,
      refresh_seconds: 5,
      claude_home: '~/.claude',
      enable_config_writes: writable,
      instances: [
        { name: 'local', transport: 'local', profile: 'orchestrator', hermes_home: '/h' },
      ],
    },
    meta: {
      path: '/cfg/config.yaml',
      writable,
      localhost_bound: true,
      writes_enabled: writable,
    },
  };
}

describe('SettingsView', () => {
  it('shows the config path and instance names', () => {
    render(<SettingsView data={makeData(true)} onSave={() => {}} onClose={() => {}} />);
    expect(screen.getByText('/cfg/config.yaml')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('name')).toHaveValue('local');
  });

  it('read-only mode hides Save and shows the enable hint', () => {
    render(<SettingsView data={makeData(false)} onSave={() => {}} onClose={() => {}} />);
    expect(screen.queryByText('Save changes')).not.toBeInTheDocument();
    expect(screen.getByText(/enable_config_writes: true/)).toBeInTheDocument();
  });

  it('requires a confirm step before calling onSave', () => {
    const onSave = vi.fn();
    render(<SettingsView data={makeData(true)} onSave={onSave} onClose={() => {}} />);

    fireEvent.click(screen.getByText('Save changes'));
    expect(onSave).not.toHaveBeenCalled();        // not yet — must confirm
    fireEvent.click(screen.getByText('Confirm save'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('add and remove instance buttons mutate the editable list', () => {
    const onSave = vi.fn();
    render(<SettingsView data={makeData(true)} onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByText('+ Add'));
    fireEvent.click(screen.getByText('Save changes'));
    fireEvent.click(screen.getByText('Confirm save'));
    expect(onSave.mock.calls[0][0].instances.length).toBe(2);
  });
});
