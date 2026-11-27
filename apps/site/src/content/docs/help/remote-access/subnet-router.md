---
title: Reach hlabs through a subnet router
description: Use a Tailscale subnet router you already have, such as a Raspberry Pi, instead of Tailscale on this computer.
features: [F-SYS-01]
---

For admins only.

If a device on your home network already runs Tailscale as a **subnet router** (it shares your home network with your tailnet), you don't need Tailscale on the computer that runs hlabs. Your phone or laptop reaches hlabs at its home-network address, through the router.

## Turn it on

1. Open **Settings › Network & remote access**.
2. Under **Remote access**, choose **Use subnet router** next to "I reach my home network through a Tailscale subnet router".

hlabs then leaves Tailscale alone and lists the dashboard's addresses that work from away, each with **Copy**:

- this computer's address on your network, such as `https://192.168.1.20`, and
- `https://hlabs.home.arpa`, if hlabs keeps its names in a local DNS server (see [Use your own DNS server](/help/remote-access/dns-server/)).

Apps you open from the dashboard at that address open at the same address with their own port, such as `https://192.168.1.20:12001`.

Invite and reset-password links use the home-network address in this mode.

## Make the names work from away

`hlabs.local` only works at home. Devices find `.local` names by asking the home network directly, and those questions don't travel through a subnet router (phones and computers never send them to a DNS server either). From away, use `hlabs.home.arpa` or the address with numbers.

Your subnet router must advertise your home network's route, and the route must be approved in the Tailscale admin console. Each device must also accept routes: on a Mac, turn on **Use Tailscale subnets** in the Tailscale menu; on Linux, run `tailscale up --accept-routes`. Phones accept them already.

To use `hlabs.home.arpa` and app names like `jellyfin.hlabs.home.arpa` from away, add **split DNS** in the Tailscale admin console, under **DNS › Nameservers**: send the domain `home.arpa` to your local DNS server's address (such as your Pi-hole's). Without it, use the address with numbers.

Give this computer a fixed address in your router, so the address you copied keeps working.

### If it doesn't open from away

With Tailscale on and away from home, try these in order:

1. **The address with numbers**, such as `https://192.168.1.20`. If it doesn't open, the route isn't reaching home: check that the subnet router advertises it, that it's approved, and that this device accepts routes.
2. **Your DNS server's address**, such as your Pi-hole's `http://192.168.1.10/admin`. If it doesn't open, the same route problem stops it.
3. **`https://hlabs.home.arpa`**. If the browser can't find it while the first two work, add the split DNS above.

A certificate warning means this device still needs hlabs's certificate ([below](#remove-the-browser-warning)).

## Remove the browser warning

hlabs uses its own certificate on the home network. Install it once on each phone or laptop you use away from home, the same as at home.

## Go back to Tailscale on this computer

Choose **Use Tailscale on this computer instead**. Remote access then shows **Connect**, as in [Reach hlabs from anywhere](/help/remote-access/tailscale/).
