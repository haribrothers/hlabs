// Account › Signed-in devices (US-ACCT-04, US-ACCT-05): each live session as "<device> · <browser>" over
// "<network> · <last seen>", this device first.
import { Laptop, Smartphone, Tablet, MonitorSmartphone, iconDefaults } from '@hlabs/icons';
import { Badge, List, ListRow } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { accountCopy } from '../copy/account';
import { useTRPC } from '../lib/trpc';
import { useNow } from '../lib/use-now';
import { describeDevice, lastSeen, networkOf, type DeviceKind } from './devices';

const copy = accountCopy;
const ICONS: Record<DeviceKind, typeof Laptop> = {
  computer: Laptop,
  phone: Smartphone,
  tablet: Tablet,
  unknown: MonitorSmartphone,
};

export function SignedInDevices() {
  const trpc = useTRPC();
  const now = useNow().getTime();
  const sessions = useQuery({ ...trpc.auth.listSessions.queryOptions(), retry: false });
  if (!sessions.data) return null;
  return (
    <List label={copy.devices}>
      {sessions.data.items.map((s) => {
        const { device, browser, kind } = describeDevice(s.userAgent);
        const Icon = ICONS[kind];
        return (
          <ListRow
            key={s.id}
            leading={<Icon aria-hidden {...iconDefaults} />}
            title={copy.deviceLine(device, browser)}
            subtitle={copy.seenLine(copy.networks[networkOf(s.ip)], lastSeen(s.lastSeenAt, now))}
            trailing={s.current ? <Badge>{copy.thisDevice}</Badge> : null}
          />
        );
      })}
    </List>
  );
}
