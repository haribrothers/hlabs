---
title: Trust hlabs on your devices
description: Why your browser warns about hlabs, and how to trust hlabs's certificate once on each device.
features: [F-SYS-03]
---

For everyone who uses hlabs.

hlabs keeps the traffic on your home network private with its own certificate. Browsers don't know that certificate until you trust it, so the first time you open hlabs they warn that the connection isn't private. You can continue past the warning for hlabs itself, but apps that open inside hlabs can't show that warning, so they can't load until the certificate is trusted.

When that happens, the app window says **"Your browser doesn't trust <app>'s address yet"**. You can:

- choose **Open in a new tab**, accept the warning there, then come back and choose **Try again**; or
- choose **Trust hlabs on this device** to trust hlabs once, so every app opens without warnings.

## Trust hlabs on this device

Choose **Trust hlabs on this device** in the app window (or open `/trust` on your hlabs address), then **Download certificate**. hlabs picks the steps for the device you're on; choose another device if it guessed wrong.

- **Mac**: open `hlabs-ca.crt`; in Keychain Access, double-click **hlabs Local CA**, open **Trust** and set **When using this certificate** to **Always Trust**.
- **Windows**: open `hlabs-ca.crt`, choose **Install Certificate**, **Current User**, and put it in **Trusted Root Certification Authorities**.
- **iPhone and iPad**: download it in Safari, install it in **Settings › General › VPN & Device Management**, then turn on full trust in **Settings › General › About › Certificate Trust Settings**.
- **Android**: install it as a **CA certificate** in your security settings (under **Encryption & credentials** on most phones).
- **Linux**: import it under **Authorities** in Chrome's or Firefox's certificate settings.

Then reload the page. You only do this once on each device. The certificate only lets your device recognise hlabs; it can't be used to read your other traffic.
