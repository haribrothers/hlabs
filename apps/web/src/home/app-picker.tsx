// "Add an app to Home" (US-HOME-18, Hari 22 Nov 2026): from Home's edit mode, the apps taken off Home, each with Add,
// which puts it back at the end of the grid (saved with Done). The way back beside ⌘K's "Add <App> to Home", where the
// app was taken off.
import { AppLogo, appTileLook, iconDefaults, X } from '@hlabs/icons';
import { Button, DialogClose, ModalDialog, tokens } from '@hlabs/ui';
import { editCopy as copy } from '../copy/home-edit';
import type { HomeApp } from './home-app';

const LOGO = tokens.SPACE_7;

export function AppPicker({
  open,
  onOpenChange,
  apps,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The apps taken off Home, in the order they were taken off. */
  apps: readonly HomeApp[];
  onAdd: (id: string) => void;
}) {
  return (
    <ModalDialog open={open} onOpenChange={onOpenChange} title={copy.appPickerTitle} sheetOnPhone>
      <DialogClose asChild>
        <button
          type="button"
          aria-label={copy.close}
          className="hl-focus absolute right-6 top-6 grid size-9 place-items-center rounded-pill border-0 bg-surface-control text-ink"
        >
          <X aria-hidden {...iconDefaults} className="size-4" />
        </button>
      </DialogClose>
      <div className="flex flex-col gap-4">
        {apps.length ? (
          <ul aria-label={copy.offHome} className="m-0 flex list-none flex-col gap-2 p-0">
            {apps.map((app) => {
              const look = appTileLook(app.name, app.icon, LOGO);
              return (
                <li key={app.id} className="flex items-center gap-3 rounded-lg bg-surface-row px-3 py-2.5">
                  <AppLogo
                    decorative
                    name={app.name}
                    src={app.icon.logoUrl}
                    colors={look.colors}
                    fallbackIcon={look.fallbackIcon}
                    size={LOGO}
                    radius={tokens.SPACE_2}
                  />
                  <span className="min-w-0 flex-1 truncate text-body font-semibold">{app.name}</span>
                  <Button size="sm" aria-label={copy.addAppNamed(app.name)} onClick={() => onAdd(app.id)}>
                    {copy.add}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="m-0 rounded-lg bg-surface-row px-4 py-3 text-body-sm text-ink-muted">{copy.allOnHome}</p>
        )}
        <p className="m-0 text-body-sm text-ink-muted">{copy.appPickerFooter}</p>
      </div>
    </ModalDialog>
  );
}
