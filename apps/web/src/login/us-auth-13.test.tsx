import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../test/render';
import { LockedView } from './locked-view';

describe('US-AUTH-13', () => {
  it('the locked page says the admin is told', async () => {
    renderScreen(() => <LockedView user="hari" until={Date.now() + 60_000} />, {
      'auth.listLoginUsers': () => ({ users: [] }),
    });
    expect(await screen.findByText('The admin gets a notification about repeated failed logins.')).toBeInTheDocument();
  });
});
