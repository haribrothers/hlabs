// "Quit hlabs" (US-INST-10, D-015): quits only the menu-bar app. The background service and the apps belong to the
// LaunchAgent and keep running, so nothing is asked first.
import { invoke } from '@tauri-apps/api/core';

export const quitTray = () => invoke('quit_tray').catch(() => {});
