// A list of installed apps, each with a Switch (InviteDialog US-ACCT-22, AppsAccess US-ACCT-24).
import { AppLogo, appTileLook } from '@hlabs/icons';
import { List, ListRow, Switch, tokens } from '@hlabs/ui';
import type { ReactNode } from 'react';
import type { HomeApp } from '../home/home-app';

const LOGO = tokens.SPACE_7;

export function AppSwitchList({
  label,
  apps,
  checked,
  onToggle,
  hint,
}: {
  label: ReactNode;
  apps: HomeApp[];
  checked: ReadonlySet<string>;
  onToggle: (appId: string, on: boolean) => void;
  /** A note under an app's name, such as "Uses its own login too". */
  hint?: (app: HomeApp) => ReactNode;
}) {
  return (
    <List label={label}>
      {[...apps]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((app) => {
          const look = appTileLook(app.name, app.icon, LOGO);
          return (
            <ListRow
              key={app.id}
              leading={
                <AppLogo
                  decorative
                  name={app.name}
                  src={app.icon.logoUrl}
                  colors={look.colors}
                  fallbackIcon={look.fallbackIcon}
                  size={LOGO}
                  radius={tokens.SPACE_2}
                />
              }
              title={app.name}
              subtitle={hint?.(app)}
              trailing={
                <Switch aria-label={app.name} checked={checked.has(app.id)} onChange={(on) => onToggle(app.id, on)} />
              }
            />
          );
        })}
    </List>
  );
}
