// A small button that copies text and then says "Copied".
import { Button } from '@hlabs/ui';
import { useState } from 'react';
import { onboardingCopy } from '../copy/onboarding';

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))}
    >
      {copied ? onboardingCopy.system.copied : label}
    </Button>
  );
}
