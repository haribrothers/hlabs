---
title: People who use hlabs
description: See everyone who has an account on your hlabs, and the invites still waiting.
features: [F-ACCT-05, F-ACCT-07, F-ACCT-08]
---

For admins only.

Open **Settings › Users** to see everyone who uses hlabs. The heading shows how many people there are, counting invites that haven't been used yet.

Each person shows:

- their name, with "(you)" after your own;
- their username and whether two-factor login is on ("2FA on" or "2FA off");
- when they last used hlabs;
- for family members, how many apps they can open;
- whether they're an **Admin** or a **Member**.

Admins can change everything and open every app. Members only see the apps you share with them, and their own files.

Someone who has been disabled is shown faded, with a **Disabled** label. They can't log in until an admin enables them again; their account and files are kept.

Invites that haven't been used yet are listed under the people, with when the link was made, how many days it has left and the role it gives. Invites that were used or have expired aren't listed.

## Invite someone

hlabs doesn't send email, so you invite people with a link. In **Settings › Users**, choose **Invite someone**. A link is made straight away; it works once and expires after 7 days.

Choose their role first. A **Member** uses only the apps you share; an **Admin** can change everything and open every app. For a member, turn on the apps they can open. You can change this later in **Apps access**.

You can type their name. It's shown on the page they open, and fills in their name when they make their account. Choose **Copy** and send the link however you like: a message, a chat app, or in person. While remote access is on, the link uses hlabs's Tailscale address, so it also works away from home for anyone on your tailnet; the home-network link is shown under it as **At home**.

Your choices save as you make them, and the link stays the same, so it's fine to copy it first. Whatever is set when they accept the invite is what they get.

To check what they'll see, choose **Preview what they see**. Their page opens in a new tab, marked as a preview; nothing can be sent from it, and it doesn't use up the invite.

Choose **Done** when you've shared it. The invite then waits under **People** until it's used. If you choose **Close** without copying the link, the invite is cancelled; once you've copied it, it's kept, because you may already have sent it.

## Copy or cancel an invite

Each invite that hasn't been used yet shows when its link was made, how many days it has left and the role it gives. Choose **Copy link** to copy the same link again, for example if they lost your message. Choose **Revoke** to cancel it: the link stops working straight away, and anyone who opens it is told it doesn't work anymore.

## Choose which apps someone can open

Family members only see and open the apps you share with them. In **Settings › Users**, choose **Apps access** next to a member, turn apps on or off, and choose **Save**. Apps you don't share aren't on their Home screen. Some apps, like Vaultwarden, also ask people to log in to the app itself; they're marked "Uses its own login too".

Below the apps there are two more switches, saved with them:

- **See the Shared folder in Files**: the folder everyone can share files in. Each person's own Home folder is always private, whatever you choose.
- **See live usage**: the Usage page with this computer's CPU, memory, storage and network. It also needs **See live usage** to be on for all members in **Users** (see below).

Changes apply straight away. An app you take away disappears from their Home screen within a couple of seconds, and if they open its address they see "You don't have access to this". An app you add appears without them logging in again.

Admins can open every app, so they have no **Apps access** button.

## Change someone's role, or disable them

Choose **•••** next to someone for more options:

- **Make admin** gives them full control: they can change everything and open every app. **Make member** takes it back; the apps you'd shared with them are remembered.
- **Disable** logs them out everywhere and stops them logging in, without deleting anything. **Enable** lets them back in with their old password.

hlabs always needs at least one admin who can log in, so it won't let you disable or demote the last one.

## Delete someone

Choose **•••** › **Delete…** next to someone who no longer uses hlabs. They're logged out, and their account, two-factor login and app access are removed; their apps keep running for everyone else.

Their Home folder is kept unless you tick **Also delete their Home folder**. Kept, it's renamed `users/<username>-deleted-<date>`, where admins can see it in Files; if someone new later picks the same username, they start with an empty Home. Ticked, it goes to the trash and is emptied after 30 days. You can't delete the last admin.

## Help someone who forgot their password

hlabs doesn't use email, so you give them a link instead. In **Settings › Users**, choose **Reset password** next to them and send them the link. It works once, for 15 minutes; making a new one stops the old one. When they choose a new password with it, they're logged out on every device and log in again with the new one.

## The log-in screen

Under **Log-in screen**, **Show the list of users** decides whether the log-in screen shows everyone's name and picture to choose from. Turn it off and everyone types their username instead. That's a good idea if hlabs can be reached away from home with Tailscale, so people who aren't family can't see who lives there.

**Require two-factor for everyone** makes everyone use two-factor login. Anyone who hasn't set it up is asked to the next time they log in, and nobody can turn theirs off while it's required. You need two-factor on your own account before you can turn this on.

## What members can do

Under **What members can do**:

- **Install apps from the App Store** lets family members install apps themselves, from hlabs's own App Store and only apps that don't ask for risky access. An app they install is shared with them straight away. Off, they can only open the apps you share.
- **See live usage** lets members see the Usage page, but only those you've also turned it on for in **Apps access**.


## When someone forgets their password

hlabs doesn't use email, so an admin makes a one-time reset link: in Settings › Users, choose **Reset password** next to their name and send them the link. It works once, for 15 minutes. When they open it, they choose a new password and are signed in; their other devices are signed out. If their account has two-factor on, they then log in with the new password and their code.
