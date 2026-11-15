// The folder's toolbar (FilesBrowser): Share folder (phase 8), New folder and Upload. In a read-only place (App data,
// a read-only drive, the lists of places) they're unavailable and say why on hover and to screen readers (US-FILE-03).
import { iconDefaults, Upload } from '@hlabs/icons';
import { isFeatureEnabled } from '@hlabs/shared';
import { Button } from '@hlabs/ui';
import { useId, type ReactNode } from 'react';
import { filesCopy as copy } from '../copy/files';

function ToolButton({
  readOnly,
  primary,
  onClick,
  children,
}: {
  readOnly: boolean;
  primary?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const why = useId();
  return (
    <>
      <Button
        variant={primary ? 'primary' : 'secondary'}
        size="sm"
        aria-disabled={readOnly || undefined}
        aria-describedby={readOnly ? why : undefined}
        title={readOnly ? copy.readOnly : undefined}
        className={readOnly ? 'cursor-not-allowed opacity-50' : undefined}
        onClick={() => (readOnly ? undefined : onClick())}
      >
        {children}
      </Button>
      {readOnly ? (
        <span id={why} className="sr-only">
          {copy.readOnly}
        </span>
      ) : null}
    </>
  );
}

export function FolderToolbar({
  readOnly,
  onNewFolder,
  onUpload,
}: {
  readOnly: boolean;
  onNewFolder: () => void;
  /** Absent until uploads are wired (US-FILE-08). */
  onUpload?: () => void;
}) {
  return (
    <>
      {isFeatureEnabled('networkShares') ? (
        <ToolButton readOnly={readOnly} onClick={() => {}}>
          {copy.shareFolder}
        </ToolButton>
      ) : null}
      <ToolButton readOnly={readOnly} onClick={onNewFolder}>
        {copy.newFolder}
      </ToolButton>
      {onUpload ? (
        <ToolButton readOnly={readOnly} primary onClick={onUpload}>
          <Upload aria-hidden {...iconDefaults} className="size-4" />
          {copy.upload}
        </ToolButton>
      ) : null}
    </>
  );
}
