// Files' "+" on a phone (PhoneRedesignA_Files): a sheet with what the desktop's toolbar offers, New folder and Upload.
import { FolderPlus, iconDefaults, Upload } from '@hlabs/icons';
import { BottomSheet, InsetRowButton } from '@hlabs/ui';
import { useRef } from 'react';
import { filesCopy as copy } from '../copy/files';

export function AddSheet({
  open,
  onOpenChange,
  onNewFolder,
  onUpload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewFolder: () => void;
  /** Absent until uploads are wired (US-FILE-08). */
  onUpload?: () => void;
}) {
  // After a choice, focus belongs to what it opened (New folder's name), not back on "+".
  const chose = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => {
        if (o) chose.current = false;
        onOpenChange(o);
      }}
      label={copy.addHere}
      onOpenAutoFocus={() => {
        chose.current = false;
        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }}
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        if (!chose.current && opener.current?.isConnected) opener.current.focus();
      }}
    >
      <div className="hl-p-sheet-list pt-12">
        <div className="hl-p-group">
          <InsetRowButton
            title={copy.newFolder}
            trailing={
              <span aria-hidden className="hl-p-row-glyph">
                <FolderPlus {...iconDefaults} />
              </span>
            }
            onClick={() => {
              chose.current = true;
              onOpenChange(false);
              onNewFolder();
            }}
          />
          {onUpload ? (
            <InsetRowButton
              title={copy.upload}
              trailing={
                <span aria-hidden className="hl-p-row-glyph">
                  <Upload {...iconDefaults} />
                </span>
              }
              // The file chooser opens in the tap itself (browsers allow it only then); the sheet closes after.
              onClick={() => {
                chose.current = true;
                onUpload();
                onOpenChange(false);
              }}
            />
          ) : null}
        </div>
      </div>
    </BottomSheet>
  );
}
