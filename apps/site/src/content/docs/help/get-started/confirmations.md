---
title: Confirmations and notices
description: How hlabs asks before it interrupts things, and the notices it shows.
features: [F-STATE-04, F-STATE-05, F-STATE-06]
---

For everyone who uses hlabs.

## Before something disruptive

Before hlabs does something that interrupts apps or people, such as restarting the engine, it asks first. The question names what's about to happen and says what it means for you, for example "Restart the container engine?" with "All apps stop for about a minute." The button says what it does (**Restart**), so you never have to guess what "OK" means.

To back out, choose **Cancel**, press Escape, or click outside the question. Nothing happens, and you're back where you were. While the question is open, the rest of the page waits.

With a keyboard, Tab moves between the two buttons only. For something that can't be undone, **Cancel** is selected first, so pressing Enter by mistake is safe.

On a phone, the question slides up from the bottom of the screen, with the action above **Cancel**.

## Extra checks for the riskiest actions

A few actions can't be undone and affect everyone, so hlabs asks for more than a click. Restoring from a backup and resetting hlabs to factory settings ask for **your password**; a factory reset also asks you to type your hostname exactly as shown (capital letters count). The button stays unavailable until you've filled these in. Your password manager can fill the password, and you can paste into both fields.

If the password isn't right, hlabs says "That password isn't right." and clears the field so you can try again. Wrong passwords here count towards the same limit as logging in: after 5 in 15 minutes, you have to wait 15 minutes.

Once you choose the action, the button shows that hlabs is working, and the question stays until it's done. If it doesn't work, the question stays open and says why and what to do next, so you can try again or cancel. Something that takes a while, such as a restart, carries on after the question closes, and hlabs tells you when it's finished. If an action takes longer than 30 seconds, the question closes anyway and the result appears as a notice.

## Notices

hlabs tells you about things that happen, such as an app finishing its install, with a short notice in the bottom-right corner (on a phone, just above the tab bar). Each kind has its own icon and colour:

- **Good news** (a tick), such as "Immich is ready", and **for your information** notices go away after 5 seconds.
- **Warnings** (a triangle), such as "Low disk space", go away after 10 seconds.
- **Problems** (a cross), such as "Uptime Kuma couldn't start", stay until you close them with the **×** button, so you don't miss them.

Moving the pointer over a notice, or tabbing into it, keeps it on screen until you move away. If **Reduce motion** is on, notices appear and leave without sliding.

Some notices come with a button for the next step, such as **Retry** when an app couldn't start. Retry tries again straight away: if it works, the notice is replaced by one saying so; if not, it stays and says what went wrong this time. Buttons that change hlabs are only shown to admins; family members see the notice and the **×**.

Up to three notices show at a time, newest on top; others wait their turn and appear as those go. If the same problem happens again while its notice is showing, such as an app failing to start twice, the notice is updated rather than repeated. Notices about hlabs itself show in every browser and device where you're logged in: close one with **×** and it goes from the others too, and it's marked as read.

## When something goes wrong

hlabs explains problems in plain words and says what to do next, for example "Uptime Kuma couldn't start. Port 3001 is already in use by another program." When something you started from a button fails, a notice says so; in a question or a form, the message appears right next to what needs fixing. If hlabs doesn't know what went wrong, it says "Something went wrong" and suggests checking the logs in **Settings › Advanced**, where the technical details are kept.
