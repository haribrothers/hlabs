---
title: Live usage
description: See how busy the computer running hlabs is, and which apps use the most.
features: [F-USE-01]
---

For admins, and for family members their admin lets see it.

Choose **Usage** in the Dock to see how busy the computer running hlabs is. Under the title, hlabs says which container engine runs your apps and how much of the computer it may use, for example **Container VM (Colima) · 4 CPUs · 8 GB allocated**.

Four tiles sum it up:

- **CPU:** how much of the processor is in use, with the processor's name and number of cores.
- **Memory:** memory in use, out of the total, and how much of it your apps use.
- **Storage:** space used on the disk where hlabs keeps your files (an external drive, if that's where they are).
- **Network:** data coming in each second, and going out.

## Look back in time

Below the tiles, a chart shows how busy the processor has been, and its highest point, for example **Peak 46% at 16:32**. Choose a tile to chart that instead:

- **CPU:** the processor, from 0 to 100%.
- **Memory:** columns split into the five apps using the most memory and **Other** (every other app, hlabs and the computer itself). An app you uninstalled still shows under its name for the time it was there.
- **Storage:** one bar of the disk by use: apps, files, system and what's free.
- **Network:** data coming **In** and going **Out**; the peak says which was higher.

Point at the chart to read the time and values. Choose **1 hour**, **24 hours** or **7 days** at the top right to change how far back it goes; hlabs remembers your choice on this browser. The last hour keeps moving as new readings arrive; the longer ranges refresh every minute. If hlabs hasn't been running that long, the chart shows what it has.

The numbers update by themselves every few seconds. The Live usage widget on Home shows CPU and memory too; choose it to open this page.

Family members only see Usage if their admin turned on **See live usage** for members in Settings › Users and for them in their apps access; they then see the computer's tiles and only the apps shared with them.

## See which app uses the most

Below the chart, a table lists your apps with their **CPU**, **Memory**, **Network** and **Status**. CPU is each app's share of the whole computer, on the same scale as the CPU tile; Network is data in and out together.

The table starts with the app using the most memory at the top. Choose a column's name to sort by it, most first (App and Status go A to Z); choose it again to reverse the order. hlabs remembers your choice on this browser. Numbers update every few seconds, but the rows only change places every 10 seconds, so they don't move while you're reading. On a phone, the table shows the app, the column you sorted by and its status.

Apps that aren't running show **—** instead of numbers and always sit below the running ones. Their status says why: **Stopped**, **Starting**, **Restarting**, **Updating**, or **Error** if the app isn't responding (see [Manage an app](/help/apps/manage-apps/) to restart it or read its logs). If you haven't installed any apps yet, the table says **No apps yet**; choose **Browse the App Store** to find some.

## Read the charts with a keyboard or screen reader

Press Tab to reach a chart, then use the **Left** and **Right** arrow keys to move from one point to the next; **Home** and **End** jump to the first and last. Each point is read out, for example "16:32, CPU 46%". In the memory chart, **Up** and **Down** move between the apps in the same column. Screen readers also find a table with the same values next to each chart. Over long ranges the chart steps through up to 200 points, always keeping the highest ones.

With high-contrast or forced colours turned on, each line has its own style (solid, dashed, dotted) and each part of a bar its own pattern, so you can tell them apart without colour.

If the processor stays at 90% or more, or memory is 90% full, the tile says **High**. A busy computer can make apps slow; the per-app table below shows which app is using the most.
