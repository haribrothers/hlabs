// Prevents an extra console window on Windows in release; hlabs ships on macOS and Linux only.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    hlabs_tray_lib::run()
}
