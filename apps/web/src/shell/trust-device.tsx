// "Trust hlabs on this device" (phase 2 feedback, D-097): download the local CA certificate and the steps to trust
// it on this kind of device, picked from the browser and changeable. From the app window it's a dialog over the window;
// `/trust` shows the same as a page, for links. The full guide (QR code for phones, per-browser detail) is CertGuide,
// US-SYS-09.
import { Download, iconDefaults, ShieldCheck } from '@hlabs/icons';
import { Button, GlassCard, ModalDialog, Segmented } from '@hlabs/ui';
import { useEffect, useState } from 'react';
import { trustCopy, type DeviceOs } from '../copy/trust';

const copy = trustCopy;
const ORDER: DeviceOs[] = ['mac', 'windows', 'ios', 'android', 'linux'];
/** Wide enough for the five device choices on one line. */
const DIALOG_WIDTH = 'min(640px, calc(100vw - 32px))';

/** This device, from the browser; a Mac when it can't tell. */
export function deviceOs(userAgent: string, touch = false): DeviceOs {
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touch)) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  if (/Windows/.test(userAgent)) return 'windows';
  if (/Linux|X11|CrOS/.test(userAgent)) return 'linux';
  return 'mac';
}

const thisDevice = () =>
  deviceOs(navigator.userAgent, typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1);

/** The certificate to download and the steps for the device chosen. */
function TrustSteps() {
  const [os, setOs] = useState<DeviceOs>(thisDevice);
  return (
    <div className="flex flex-col gap-6">
      <a
        href="/ca.crt"
        download="hlabs-ca.crt"
        className="hl-btn hl-btn-primary hl-btn-md hl-focus self-start no-underline"
      >
        <Download aria-hidden {...iconDefaults} className="size-4" />
        {copy.download}
      </a>
      <div className="flex flex-col gap-4">
        <Segmented
          aria-label={copy.device}
          options={ORDER.map((value) => ({ value, label: copy.os[value] }))}
          value={os}
          onChange={(v) => setOs(v as DeviceOs)}
        />
        <ol aria-label={copy.os[os]} className="m-0 flex list-decimal flex-col gap-3 pl-5 text-body text-ink">
          {copy.steps[os].map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="m-0 text-body-sm text-ink-muted">{copy.after}</p>
      </div>
    </div>
  );
}

/** The guide as a dialog, over whatever opened it (the app window). */
export function TrustDeviceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.lead}
      width={DIALOG_WIDTH}
      sheetOnPhone
      actions={
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {copy.close}
        </Button>
      }
    >
      <TrustSteps />
    </ModalDialog>
  );
}

/** The guide as a page (`/trust`), for links and the help page. */
export function TrustDevice() {
  useEffect(() => {
    document.title = copy.docTitle;
  }, []);
  return (
    <GlassCard level={2} className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-7">
      <header className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-surface-control text-accent">
          <ShieldCheck aria-hidden {...iconDefaults} className="size-6" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-title-1">{copy.title}</h1>
          <p className="m-0 text-body text-ink-muted">{copy.lead}</p>
        </div>
      </header>
      <TrustSteps />
    </GlassCard>
  );
}
