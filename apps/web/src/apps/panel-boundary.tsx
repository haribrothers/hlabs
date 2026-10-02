// A dialog over the app window that fails to render shows that inside a dialog, over the window, instead of
// replacing the page (phase 2 feedback, D-096): what happened, Try again and Close. Never the raw error.
import { Button, ModalDialog } from '@hlabs/ui';
import { Component, type ReactNode } from 'react';
import { appsCopy } from '../copy/apps';
import { errorCopy } from '../copy/errors';

interface Props {
  onClose: () => void;
  children: ReactNode;
}

export class PanelBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error(error);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    const { title, body } = errorCopy.generic;
    return (
      <ModalDialog
        open
        onOpenChange={(open) => (open ? undefined : this.props.onClose())}
        title={title}
        description={body}
        actions={
          <>
            <Button variant="secondary" onClick={this.props.onClose}>
              {appsCopy.close}
            </Button>
            <Button onClick={() => this.setState({ failed: false })}>{appsCopy.tryAgain}</Button>
          </>
        }
      />
    );
  }
}
