// US-APP-13 · Edit environment variables: each variable as a Name and a Value with "Remove variable"; the manifest's
// settings with the control for their type, names read only and not removable; "+ Add variable" with focus in Name;
// invalid, repeated and reserved names say so inline and Save waits; a number setting needs a number.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { appConfig, renderConfig } from '../test/app-config';

const envList = () => screen.findByRole('group', { name: 'Environment variables' });
const save = () => screen.getByRole('button', { name: 'Save and restart app' });

describe('US-APP-13', () => {
  it('lists each variable as a Name and Value with Remove, and says values come pre-filled', async () => {
    renderConfig();
    const list = await envList();
    expect(within(list).getByRole('textbox', { name: 'Name of DOMAIN' })).toHaveValue('DOMAIN');
    expect(within(list).getByRole('textbox', { name: 'Value of DOMAIN' })).toHaveValue(
      'https://vaultwarden.hlabs.local',
    );
    expect(within(list).getByRole('button', { name: 'Remove DOMAIN' })).toBeEnabled();
    expect(screen.getByText("Values from the app's manifest are pre-filled")).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it("a manifest setting's name is read only, its control fits its type and it can't be removed", async () => {
    renderConfig();
    const list = await envList();
    expect(within(list).getByRole('textbox', { name: 'Name of WEB_WORKERS' })).toHaveAttribute('readonly');
    expect(within(list).getByRole('button', { name: 'Remove WEB_WORKERS' })).toBeDisabled();
    // Boolean: a Switch; a choice of three: a Segmented; a number: a text field.
    expect(within(list).getByRole('switch', { name: 'Value of SIGNUPS_ALLOWED' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const level = within(list).getByRole('radiogroup', { name: 'Value of LOG_LEVEL' });
    expect(within(level).getByRole('radio', { name: 'info' })).toHaveAttribute('aria-checked', 'true');
    expect(within(list).getByRole('textbox', { name: 'Value of WEB_WORKERS' })).toHaveValue('4');
  });

  it('a choice of more than three is a menu', async () => {
    const config = appConfig();
    config.env[2] = {
      ...config.env[2]!,
      prompt: { ...config.env[2]!.prompt!, options: ['debug', 'info', 'warn', 'error'] },
    };
    renderConfig({}, config);
    const list = await envList();
    expect(within(list).getByRole('combobox', { name: 'Value of LOG_LEVEL' })).toHaveValue('info');
  });

  it('"+ Add variable" adds an empty row with focus in Name', async () => {
    renderConfig();
    await envList();
    fireEvent.click(screen.getByRole('button', { name: '+ Add variable' }));
    const name = screen.getByRole('textbox', { name: 'Name of the new variable' });
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveValue('');
  });

  it.each([
    ['1ABC', 'Use capital letters, numbers and _, not starting with a number'],
    ['DOMAIN', 'This name is already used'],
    ['HLABS_URL', 'hlabs sets this one itself. Choose another name'],
    ['TZ', 'hlabs sets this one itself. Choose another name'],
    ['PUID', 'hlabs sets this one itself. Choose another name'],
  ])('the name %s shows "%s" and Save waits', async (key, message) => {
    renderConfig();
    await envList();
    fireEvent.click(screen.getByRole('button', { name: '+ Add variable' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name of the new variable' }), { target: { value: key } });
    expect(await screen.findAllByText(message)).not.toHaveLength(0);
    expect(save()).toBeDisabled();
  });

  it('a number setting given something else shows "Enter a number"', async () => {
    renderConfig();
    const list = await envList();
    fireEvent.change(within(list).getByRole('textbox', { name: 'Value of WEB_WORKERS' }), {
      target: { value: 'lots' },
    });
    expect(await screen.findByText('Enter a number')).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it('saving sends the whole list, new variable included, secrets left as they were', async () => {
    const { calls } = renderConfig({ 'apps.setConfig': () => ({ jobId: 'j1' }) });
    const list = await envList();
    fireEvent.change(within(list).getByRole('textbox', { name: 'Value of WEB_WORKERS' }), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Add variable' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name of the new variable' }), { target: { value: 'extra' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Value of EXTRA' }), { target: { value: '1' } });
    fireEvent.click(within(list).getByRole('button', { name: 'Remove DOMAIN' }));
    fireEvent.click(save());
    await waitFor(() => expect(calls.find((c) => c.path === 'apps.setConfig')).toBeDefined());
    expect(calls.find((c) => c.path === 'apps.setConfig')!.input).toEqual({
      appId: 'vaultwarden',
      env: [
        { key: 'SIGNUPS_ALLOWED', value: 'true', secret: false },
        { key: 'WEB_WORKERS', value: '8', secret: false },
        { key: 'LOG_LEVEL', value: 'info', secret: false },
        { key: 'ADMIN_TOKEN', secret: true },
        { key: 'SMTP_PASSWORD', secret: true },
        { key: 'EXTRA', value: '1', secret: false },
      ],
    });
  });
});
