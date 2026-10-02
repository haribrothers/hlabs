//! The menu window behaves like a native menu-bar menu: it opens centred under the hlabs icon (kept
//! on the icon's screen), closes when you click anywhere else, and a click on the icon while it is
//! open closes it.

use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, PhysicalPosition, Rect, WebviewWindow};

pub const MENU_WINDOW: &str = "menu";
/// Space between the menu bar and the menu, in logical pixels.
const GAP: f64 = 4.0;
/// Margin kept from the screen's edges, in logical pixels.
const EDGE: f64 = 8.0;
/// A click on the icon this soon after the menu closed by losing focus is that same click.
const BLUR_CLICK: Duration = Duration::from_millis(250);

/// A rectangle in physical pixels: x, y, width, height.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Area {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// Where the menu goes: centred under the icon, below the menu bar, inside the screen.
pub fn menu_position(icon: Area, menu_width: f64, screen: Area, scale: f64) -> (f64, f64) {
    let centred = icon.x + icon.w / 2.0 - menu_width / 2.0;
    let min = screen.x + EDGE * scale;
    let max = screen.x + screen.w - menu_width - EDGE * scale;
    let x = if max < min {
        min
    } else {
        centred.clamp(min, max)
    };
    let y = icon.y + icon.h + GAP * scale;
    (x.round(), y.round())
}

/// When the menu last closed because it lost focus.
#[derive(Default)]
pub struct MenuState(Mutex<Option<Instant>>);

fn icon_area(rect: &Rect, scale: f64) -> Area {
    let p = rect.position.to_physical::<f64>(scale);
    let s = rect.size.to_physical::<f64>(scale);
    Area {
        x: p.x,
        y: p.y,
        w: s.width,
        h: s.height,
    }
}

fn place(window: &WebviewWindow, rect: &Rect) -> tauri::Result<()> {
    let scale = window.scale_factor()?;
    let icon = icon_area(rect, scale);
    let monitor = window
        .monitor_from_point(icon.x + icon.w / 2.0, icon.y + icon.h / 2.0)?
        .or(window.current_monitor()?);
    let Some(monitor) = monitor else {
        return Ok(());
    };
    let screen = Area {
        x: f64::from(monitor.position().x),
        y: f64::from(monitor.position().y),
        w: f64::from(monitor.size().width),
        h: f64::from(monitor.size().height),
    };
    let width = f64::from(window.outer_size()?.width);
    let (x, y) = menu_position(icon, width, screen, monitor.scale_factor());
    window.set_position(PhysicalPosition::new(x, y))
}

/// Opens the menu under the icon at `rect`.
pub fn show_menu(app: &AppHandle, rect: Option<&Rect>) {
    let Some(window) = app.get_webview_window(MENU_WINDOW) else {
        return;
    };
    if let Some(rect) = rect {
        let _ = place(&window, rect);
    }
    let _ = window.show().and_then(|_| window.set_focus());
}

/// A click on the icon: opens the menu, or closes it when it is open.
pub fn toggle_menu(app: &AppHandle, rect: &Rect) {
    let Some(window) = app.get_webview_window(MENU_WINDOW) else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
        return;
    }
    // The click that took focus away already closed it.
    let closed_by_this_click = app
        .state::<MenuState>()
        .0
        .lock()
        .expect("menu state poisoned")
        .is_some_and(|at| at.elapsed() < BLUR_CLICK);
    if !closed_by_this_click {
        show_menu(app, Some(rect));
    }
}

/// A click anywhere else closes the menu.
pub fn on_blur(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MENU_WINDOW) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
            *app.state::<MenuState>()
                .0
                .lock()
                .expect("menu state poisoned") = Some(Instant::now());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCREEN: Area = Area {
        x: 0.0,
        y: 0.0,
        w: 3024.0,
        h: 1964.0,
    };

    #[test]
    fn opens_centred_under_the_icon_below_the_menu_bar() {
        let icon = Area {
            x: 2400.0,
            y: 0.0,
            w: 44.0,
            h: 74.0,
        };
        assert_eq!(menu_position(icon, 600.0, SCREEN, 2.0), (2122.0, 82.0));
    }

    #[test]
    fn stays_inside_the_screen_near_its_right_edge() {
        let icon = Area {
            x: 2960.0,
            y: 0.0,
            w: 44.0,
            h: 74.0,
        };
        let (x, _) = menu_position(icon, 600.0, SCREEN, 2.0);
        assert_eq!(x, 3024.0 - 600.0 - 16.0);
    }

    #[test]
    fn stays_on_the_icons_screen_when_that_screen_is_to_the_right() {
        let second = Area {
            x: 3024.0,
            y: 0.0,
            w: 2560.0,
            h: 1440.0,
        };
        let icon = Area {
            x: 3030.0,
            y: 0.0,
            w: 30.0,
            h: 24.0,
        };
        let (x, y) = menu_position(icon, 300.0, second, 1.0);
        assert_eq!((x, y), (3032.0, 28.0));
    }
}
