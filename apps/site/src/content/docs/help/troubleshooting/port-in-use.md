---
title: Another program is using hlabs's port
description: When another program takes port 443 or 80, other devices can't reach hlabs. Move hlabs to another port.
features: [F-SYS-01]
---

For admins.

hlabs's dashboard and apps answer on ports 443 and 80 of the computer running it. If another program takes one of them (another web server, a development tool, Tailscale Serve), other devices can't reach hlabs. The menu bar says **Can't use port 443**, and on a Linux server `hlabs status` says the same.

## What to try, in order

1. Choose **Use port 8443** in the menu bar's menu, or **Use port 8443 for the dashboard** in Settings › Network: hlabs moves to 8443 and every address it shows includes the port. When the other program lets go, hlabs goes back on its next start.
2. Or stop the other program, then restart hlabs.
3. If 8443 is taken too, hlabs says so: stop one of the programs using them.

See also [Can't reach hlabs](../../get-started/cant-reach/#another-program-is-using-port-443).

## Collect diagnostics

- **Mac or Linux desktop:** click the hlabs icon in the menu bar and choose **Copy diagnostics**.
- **Linux server:** run `sudo hlabs status` and `sudo hlabs logs`.
- **In the dashboard:** Settings › Advanced has the logs.

## Still stuck?

Copy the diagnostics (above), then [open an issue on GitHub](https://github.com/haribrothers/hlabs/issues/new?template=bug_report.yml) and paste them in. They contain no passwords or file names.
