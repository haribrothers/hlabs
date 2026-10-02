---
title: Add family to your tailnet
description: Let family members reach hlabs away from home with Tailscale.
features: [F-SYS-01, F-ACCT-07]
---

For admins only.

Your hlabs account and your tailnet are separate. An invite gives someone an hlabs account; to reach hlabs away from home, their phone or laptop also needs to be on your tailnet.

1. Each person installs Tailscale on their devices from [tailscale.com/download](https://tailscale.com/download) and makes a free Tailscale account.
2. In the Tailscale admin console, either invite them to your tailnet (**Users › Invite users**), or share just this computer with them (**Machines ›** this computer **› Share**). Sharing only this computer is the smallest step: they see hlabs and nothing else on your tailnet.
3. Once they've accepted, the invite link you made in hlabs works for them anywhere, because it uses this computer's tailnet address.

If your tailnet has access rules, make sure they allow these people to reach this computer.
