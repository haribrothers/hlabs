// The "Public" badge (US-APP-27; 07 §7.10 control 5): on an app everywhere it appears while it's reachable from the
// internet: its Home tile, App settings, Settings › Network. A globe and the word, never colour alone.
import { Globe, iconDefaults } from '@hlabs/icons';
import { Badge } from '@hlabs/ui';
import { publicCopy as copy } from '../copy/public';

export function PublicBadge({ className }: { className?: string }) {
  return (
    <Badge tone="warning" className={className}>
      <Globe aria-hidden {...iconDefaults} size={12} />
      {copy.publicBadge}
    </Badge>
  );
}
