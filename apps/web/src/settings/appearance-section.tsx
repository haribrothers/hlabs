// Settings › Appearance (US-ACCT-32…35, SettingsAppearance): everyone's own look, applied at once and saved for
// their account. Wallpaper (Dusk, Ocean, Forest or their own photo), accent colour, what Home shows, and reduce
// transparency and motion. A change shows straight away; one that fails to save goes back and says so.
import { Check, iconDefaults, ImagePlus } from '@hlabs/icons';
import { List, ListRow, Switch } from '@hlabs/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { appearanceCopy as copy } from '../copy/appearance';
import { homeCopy } from '../copy/home';
import {
  ACCENT_IDS,
  reducesMotion,
  useOsReducesMotion,
  WALLPAPER_IDS,
  WALLPAPERS,
  wallpaperStyle,
  type Accent,
  type Appearance,
  type Wallpaper,
} from '../lib/appearance';
import { csrfHeaders } from '../lib/csrf';
import { handledGlobally } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useIsDesktop } from '../lib/use-media';
import { useMe } from '../lib/use-me';

type Change = Partial<{
  wallpaper: Wallpaper;
  accent: Accent;
  reduceTransparency: boolean;
  reduceMotion: boolean;
  showWidgets: boolean;
  showGreeting: boolean;
}>;

/** Photos people can use (US-ACCT-32); the daemon checks the bytes too. */
export const WALLPAPER_MAX_BYTES = 10 * 1024 * 1024;
const WALLPAPER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** The person's appearance in auth.me's cache, changed at once (the shell and Home follow it). */
function useAppearanceUpdate() {
  const client = useTRPCClient();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const key = trpc.auth.me.queryKey();
  const setAppearance = (next: (a: Appearance) => Appearance) =>
    queryClient.setQueryData(key, (old) => (old ? { ...old, appearance: next(old.appearance) } : old));
  const save = useMutation({
    mutationFn: (change: Change) => client.settings.appearance.update.mutate(change),
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData(key);
      setAppearance((a) => ({ ...a, ...change }));
      return { before };
    },
    onError: (err, _change, context) => {
      queryClient.setQueryData(key, context?.before);
      if (!handledGlobally(err)) showToast({ tone: 'danger', title: copy.saveFailed });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
  return { save: (change: Change) => save.mutate(change), setAppearance };
}

export function AppearanceSection() {
  const me = useMe().data;
  const { save, setAppearance } = useAppearanceUpdate();
  const os = useOsReducesMotion();
  if (!me) return null;
  const a = me.appearance;
  const name = me.displayName.trim() || me.username;
  const row = (title: string, subtitle: string | undefined, checked: boolean, change: (next: boolean) => Change) => (
    <ListRow
      title={title}
      subtitle={subtitle}
      trailing={<Switch checked={checked} aria-label={title} onChange={(next) => save(change(next))} />}
    />
  );
  return (
    <div className="flex flex-col gap-6">
      <WallpaperPicker appearance={a} onPick={(wallpaper) => save({ wallpaper })} onUploaded={setAppearance} />
      <AccentPicker accent={a.accent} onPick={(accent) => save({ accent })} />
      <List label={copy.homeScreen}>
        {row(copy.showWidgets, undefined, a.showWidgets, (showWidgets) => ({ showWidgets }))}
        {row(
          copy.showGreeting,
          copy.greetingExample(homeCopy.greeting.evening(name)),
          a.showGreeting,
          (showGreeting) => ({
            showGreeting,
          }),
        )}
        {row(copy.reduceTransparency, copy.reduceTransparencyNote, a.reduceTransparency, (reduceTransparency) => ({
          reduceTransparency,
        }))}
        {row(copy.reduceMotion, copy.reduceMotionNote, reducesMotion(a, os), (reduceMotion) => ({ reduceMotion }))}
      </List>
    </div>
  );
}

/** Sends a photo to be the wallpaper; the new appearance, or why not. */
async function uploadWallpaper(file: File): Promise<{ appearance: Appearance } | 'wrong' | 'failed'> {
  try {
    const res = await fetch('/api/appearance/wallpaper', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/octet-stream', ...csrfHeaders() },
      body: file,
    });
    if (res.ok) return (await res.json()) as { appearance: Appearance };
    return res.status === 400 || res.status === 413 ? 'wrong' : 'failed';
  } catch {
    return 'failed';
  }
}

function WallpaperPicker({
  appearance,
  onPick,
  onUploaded,
}: {
  appearance: Appearance;
  onPick: (wallpaper: Wallpaper) => void;
  onUploaded: (next: (a: Appearance) => Appearance) => void;
}) {
  const labelId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const own = appearance.customWallpaperUrl;
  // A phone (PhoneRedesignA_Appearance): four tall tiles in a box, a tick on the chosen one, a photo glyph to upload.
  const phone = !useIsDesktop();

  const choose = async (file: File | undefined) => {
    if (!file) return;
    if (!WALLPAPER_TYPES.includes(file.type) || file.size > WALLPAPER_MAX_BYTES) {
      showToast({ tone: 'danger', title: copy.wrongPhoto });
      return;
    }
    setUploading(true);
    const result = await uploadWallpaper(file);
    setUploading(false);
    if (result === 'wrong') showToast({ tone: 'danger', title: copy.wrongPhoto });
    else if (result === 'failed') showToast({ tone: 'danger', title: copy.uploadFailed });
    else {
      onUploaded(() => result.appearance);
      void queryClient.invalidateQueries({ queryKey: trpc.auth.me.queryKey() });
    }
  };

  const tile = (id: Wallpaper) => (
    <button
      key={id}
      type="button"
      className="hl-wallpick"
      aria-pressed={appearance.wallpaper === id}
      onClick={() => onPick(id)}
    >
      <span
        className={`hl-wallpick-thumb ${WALLPAPERS[id]}`}
        style={id === 'custom' ? wallpaperStyle({ wallpaper: id, customWallpaperUrl: own }) : undefined}
        aria-hidden="true"
      >
        {phone && appearance.wallpaper === id ? (
          <span className="hl-wallpick-check">
            <Check {...iconDefaults} />
          </span>
        ) : null}
      </span>
      <span>{copy.wallpapers[id]}</span>
    </button>
  );

  return (
    <div className="hl-list">
      <span id={labelId} className="hl-list-label">
        {copy.wallpaper}
      </span>
      <div className="hl-wallpicks" role="group" aria-labelledby={labelId}>
        {WALLPAPER_IDS.map(tile)}
        {own ? tile('custom') : null}
        <button
          type="button"
          className="hl-wallpick hl-wallpick-upload"
          aria-label={uploading ? copy.uploading : copy.uploadPhotoLabel}
          aria-busy={uploading}
          disabled={uploading}
          onClick={() => input.current?.click()}
        >
          <span className="hl-wallpick-thumb">
            {uploading ? copy.uploading : phone ? <ImagePlus aria-hidden {...iconDefaults} /> : copy.uploadPhoto}
          </span>
          <span>{own ? copy.newPhoto : copy.wallpapers.custom}</span>
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept={WALLPAPER_TYPES.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="wallpaper-file"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          void choose(file);
        }}
      />
    </div>
  );
}

/** Four swatches as a radio group (US-ACCT-33): arrow keys move the choice, which applies at once. */
function AccentPicker({ accent, onPick }: { accent: Accent; onPick: (accent: Accent) => void }) {
  const labelId = useId();
  // A phone names each colour under its swatch (PhoneRedesignA_Appearance).
  const phone = !useIsDesktop();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // From the swatch that has focus: quick presses run ahead of the saved choice.
    const focused = refs.current.indexOf(e.target as HTMLButtonElement);
    const i = focused >= 0 ? focused : ACCENT_IDS.indexOf(accent);
    const n = ACCENT_IDS.length;
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? (i + 1) % n
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? (i - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    onPick(ACCENT_IDS[next]!);
    refs.current[next]?.focus();
  };
  return (
    <div className="hl-list">
      <span id={labelId} className="hl-list-label">
        {copy.accent}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="hl-swatches" onKeyDown={onKeyDown}>
        {ACCENT_IDS.map((id, i) => (
          <button
            key={id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={accent === id}
            aria-label={copy.accents[id]}
            tabIndex={accent === id ? 0 : -1}
            className="hl-swatch"
            data-accent={id}
            onClick={() => onPick(id)}
          >
            <span className="hl-swatch-dot" aria-hidden="true">
              {phone && accent === id ? <Check {...iconDefaults} /> : null}
            </span>
            {phone ? (
              <span className="hl-swatch-name" aria-hidden="true">
                {copy.accents[id]}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
