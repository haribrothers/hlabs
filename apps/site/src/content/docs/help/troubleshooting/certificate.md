---
title: Your browser warns about the connection
description: Why your browser says the connection to hlabs isn't private, and how to trust hlabs on each device.
features: [F-SYS-01]
---

For everyone.

hlabs uses its own certificate to keep traffic on your home network private. Your browser doesn't know that certificate until you trust it, so at `https://hlabs.local` it warns you, and apps inside hlabs can't open.

## What to try, in order

1. In the dashboard, follow **Trust hlabs on this device**: download the certificate and trust it, once on each device. See [Trust this device](../../get-started/trust-device/).
2. Away from home, use hlabs's Tailscale address instead: its certificate is trusted everywhere. See [Reach hlabs from anywhere](../../remote-access/tailscale/).
3. If the warning names another address than the one you typed, open hlabs from the address in **Settings › Network** instead.

## Collect diagnostics

- **Mac or Linux desktop:** click the hlabs icon in the menu bar and choose **Copy diagnostics**.
- **Linux server:** run `sudo hlabs status` and `sudo hlabs logs`.
- **In the dashboard:** Settings › Advanced has the logs.

## Still stuck?

Copy the diagnostics (above), then [open an issue on GitHub](https://github.com/haribrothers/hlabs/issues/new?template=bug_report.yml) and paste them in. They contain no passwords or file names.
