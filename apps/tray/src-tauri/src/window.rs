//! The menu window behaves like a native menu-bar menu: it opens centred under the hlabs icon (kept
//! on the icon's screen), closes when you click anywhere else, and a click on the icon while it is
//! open closes it.
//!
//! Placement works in logical points, the one coordinate space macOS shares across screens. The
//! physical values tao and tray-icon hand back are each scaled by a different screen (the icon's,
//! the primary one's, the window's current one), so mixing them put the menu on the last screen it
//! was shown on when screens have different scales.

use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, LogicalPosition, Manager, Rect, WebviewWindow};

pub const MENU_WINDOW: &str = "menu";
/// Space between the menu bar and the menu, in logical pixels.
const GAP: f64 = 4.0;
/// Margin kept from the screen's edges, in logical pixels.
const EDGE: f64 = 8.0;
/// A click on the icon this soon after the menu closed by losing focus is that same click.
const BLUR_CLICK: Duration = Duration::from_millis(250);

/// A rectangle: x, y, width, height.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Area {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Area {
    fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x < self.x + self.w && y >= self.y && y < self.y + self.h
    }

    fn scaled(&self, by: f64) -> Area {
        Area {
            x: self.x / by,
            y: self.y / by,
            w: self.w / by,
            h: self.h / by,
        }
    }
}

/// A screen in logical points, with its scale.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Screen {
    pub area: Area,
    pub scale: f64,
}

/// Where the menu goes, in logical points: centred under the icon, below the menu bar, inside the
/// screen. `icon`, `screen` and `menu_width` are all logical.
pub fn menu_position(icon: Area, menu_width: f64, screen: Area) -> (f64, f64) {
    let centred = icon.x + icon.w / 2.0 - menu_width / 2.0;
    let min = screen.x + EDGE;
    let max = screen.x + screen.w - menu_width - EDGE;
    let x = if max < min {
        min
    } else {
        centred.clamp(min, max)
    };
    let y = icon.y + icon.h + GAP;
    (x.round(), y.round())
}

/// The screen the icon is on and the icon in logical points. `icon` is physical, scaled by its own
/// screen; `cursor` is logical. The screen under the cursor wins (the click was there); otherwise
/// the first screen that holds the icon at its own scale.
pub fn icon_screen(
    icon: Area,
    cursor: Option<(f64, f64)>,
    screens: &[Screen],
) -> Option<(Screen, Area)> {
    let holds = |s: &Screen| {
        let logical = icon.scaled(s.scale);
        s.area
            .contains(logical.x + logical.w / 2.0, logical.y + logical.h / 2.0)
            .then_some((*s, logical))
    };
    cursor
        .and_then(|(x, y)| screens.iter().find(|s| s.area.contains(x, y)))
        .and_then(holds)
        .or_else(|| screens.iter().find_map(holds))
}

/// When the menu last closed because it lost focus.
#[derive(Default)]
pub struct MenuState(Mutex<Option<Instant>>);

fn place(window: &WebviewWindow, rect: &Rect) -> tauri::Result<()> {
    let screens: Vec<Screen> = window
        .available_monitors()?
        .iter()
        .map(|m| {
            let scale = m.scale_factor();
            Screen {
                area: Area {
                    x: f64::from(m.position().x),
                    y: f64::from(m.position().y),
                    w: f64::from(m.size().width),
                    h: f64::from(m.size().height),
                }
                .scaled(scale),
                scale,
            }
        })
        .collect();
    // The cursor comes back scaled by the primary screen.
    let primary = window.primary_monitor()?.map_or(1.0, |m| m.scale_factor());
    let cursor = window
        .cursor_position()
        .ok()
        .map(|p| (p.x / primary, p.y / primary));
    // The icon's rect is physical, scaled by the icon's screen (a scale of 1 keeps it as it is).
    let p = rect.position.to_physical::<f64>(1.0);
    let s = rect.size.to_physical::<f64>(1.0);
    let icon = Area {
        x: p.x,
        y: p.y,
        w: s.width,
        h: s.height,
    };
    let Some((screen, icon)) = icon_screen(icon, cursor, &screens) else {
        return Ok(());
    };
    let width = f64::from(window.outer_size()?.width) / window.scale_factor()?;
    let (x, y) = menu_position(icon, width, screen.area);
    window.set_position(LogicalPosition::new(x, y))
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

    /// A MacBook's built-in screen (2x) with a 1x monitor to its right, both in points.
    const BUILT_IN: Screen = Screen {
        area: Area {
            x: 0.0,
            y: 0.0,
            w: 1512.0,
            h: 982.0,
        },
        scale: 2.0,
    };
    const EXTERNAL: Screen = Screen {
        area: Area {
            x: 1512.0,
            y: 0.0,
            w: 2560.0,
            h: 1440.0,
        },
        scale: 1.0,
    };

    #[test]
    fn opens_centred_under_the_icon_below_the_menu_bar() {
        let icon = Area {
            x: 1200.0,
            y: 0.0,
            w: 22.0,
            h: 37.0,
        };
        assert_eq!(menu_position(icon, 300.0, BUILT_IN.area), (1061.0, 41.0));
    }

    #[test]
    fn stays_inside_the_screen_near_its_right_edge() {
        let icon = Area {
            x: 1480.0,
            y: 0.0,
            w: 22.0,
            h: 37.0,
        };
        let (x, _) = menu_position(icon, 300.0, BUILT_IN.area);
        assert_eq!(x, 1512.0 - 300.0 - 8.0);
    }

    #[test]
    fn stays_on_the_icons_screen_when_that_screen_is_to_the_right() {
        let icon = Area {
            x: 1515.0,
            y: 0.0,
            w: 30.0,
            h: 24.0,
        };
        let (x, y) = menu_position(icon, 300.0, EXTERNAL.area);
        assert_eq!((x, y), (1520.0, 28.0));
    }

    #[test]
    fn a_click_on_the_built_in_screen_opens_there_after_the_external_one() {
        // The icon on the 2x screen at 1200 points is 2400 physical, which as points would be on
        // the external screen: the cursor says which screen was clicked.
        let icon = Area {
            x: 2400.0,
            y: 0.0,
            w: 44.0,
            h: 74.0,
        };
        let (screen, logical) =
            icon_screen(icon, Some((1210.0, 12.0)), &[BUILT_IN, EXTERNAL]).expect("a screen");
        assert_eq!(screen, BUILT_IN);
        assert_eq!(logical.x, 1200.0);
        let (x, _) = menu_position(logical, 300.0, screen.area);
        assert!(x + 300.0 <= 1512.0);
    }

    #[test]
    fn a_click_on_the_external_screen_opens_there() {
        let icon = Area {
            x: 3000.0,
            y: 0.0,
            w: 30.0,
            h: 24.0,
        };
        let (screen, logical) =
            icon_screen(icon, Some((3010.0, 10.0)), &[BUILT_IN, EXTERNAL]).expect("a screen");
        assert_eq!(screen, EXTERNAL);
        assert_eq!(logical.x, 3000.0);
    }

    #[test]
    fn without_a_cursor_the_first_screen_holding_the_icon_is_used() {
        let icon = Area {
            x: 2400.0,
            y: 0.0,
            w: 44.0,
            h: 74.0,
        };
        let (screen, _) = icon_screen(icon, None, &[BUILT_IN, EXTERNAL]).expect("a screen");
        assert_eq!(screen, BUILT_IN);
    }

    #[test]
    fn a_cursor_away_from_the_icon_falls_back_to_the_icons_screen() {
        let icon = Area {
            x: 3500.0,
            y: 0.0,
            w: 30.0,
            h: 24.0,
        };
        // Opened at start-up with the cursor in the middle of the built-in screen.
        let (screen, _) =
            icon_screen(icon, Some((700.0, 500.0)), &[BUILT_IN, EXTERNAL]).expect("a screen");
        assert_eq!(screen, EXTERNAL);
    }
}
