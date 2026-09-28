// TwoFactorManage (US-ACCT-08…12): two-factor status, the authenticator app and the recovery codes, in a dialog over
// Account. Done closes it and puts focus back on the button that opened it.
import { Smartphone, iconDefaults } from '@hlabs/icons';
import { Badge, Button, ModalDialog } from '@hlabs/ui';
import type { AppRouter } from '@hlabs/api';
import type { inferRouterOutputs } from '@trpc/server';
import { accountCopy } from '../copy/account';

const copy = accountCopy;

export type AccountData = inferRouterOutputs<AppRouter>['account']['get'];

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export function TwoFactorManage({ account, onClose }: { account: AccountData; onClose: () => void }) {
  const added =
    account.totpAddedDuringSetup || account.totpEnabledAt === null
      ? copy.addedAtSetup
      : copy.addedOn(dateFormat.format(account.totpEnabledAt));
  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={
        <span className="flex items-center justify-between gap-3">
          {copy.twoFactor}
          <Badge tone="success">{copy.on}</Badge>
        </span>
      }
      actions={<Button onClick={onClose}>{copy.done}</Button>}
    >
      <div className="flex flex-col gap-4">
        <div className="hl-list-box">
          <div className="hl-list-row">
            <Smartphone aria-hidden {...iconDefaults} />
            <span className="hl-list-text">
              <span>{copy.authenticatorApp}</span>
              <span className="hl-list-sub">{added}</span>
            </span>
          </div>
        </div>
        <h3 className="m-0 text-label text-ink-muted">{copy.recoveryTitle(account.recoveryCodesUnused)}</h3>
      </div>
    </ModalDialog>
  );
}
