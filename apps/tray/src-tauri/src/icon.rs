//! The menu-bar icon reflects hlabs's state (US-INST-14). The plain icon is a template image macOS
//! colours for the menu bar; Paused is the same at half opacity; Starting pulses (still when Reduce
//! Motion is on). A dot (red for needs attention, engine stopped or can't reach hlabs; the accent for
//! an update) can't be part of a template image, so those are drawn here: the glyph in the menu bar's
//! text colour with the dot in the top-right corner, cut out from the glyph so it stays readable.

/// Opacity steps of the Starting pulse, one every 250 ms.
pub const PULSE: [f32; 8] = [1.0, 0.85, 0.7, 0.55, 0.45, 0.55, 0.7, 0.85];

/// "#c4262b" → [196, 38, 43].
pub fn parse_hex(hex: &str) -> Option<[u8; 3]> {
    let h = hex.trim().strip_prefix('#')?;
    if h.len() != 6 {
        return None;
    }
    let byte = |i: usize| u8::from_str_radix(&h[i..i + 2], 16).ok();
    Some([byte(0)?, byte(2)?, byte(4)?])
}

/// The icon with every pixel's opacity multiplied by `factor` (Paused, the Starting pulse).
pub fn faded(rgba: &[u8], factor: f32) -> Vec<u8> {
    let mut out = rgba.to_vec();
    for px in out.chunks_exact_mut(4) {
        px[3] = (f32::from(px[3]) * factor).round() as u8;
    }
    out
}

/// The glyph in `glyph` colour with a filled `dot` in the top-right corner and a transparent ring
/// around it. `w`×`h` pixels, RGBA.
pub fn with_dot(rgba: &[u8], w: u32, h: u32, glyph: [u8; 3], dot: [u8; 3]) -> Vec<u8> {
    let mut out = rgba.to_vec();
    let r = w.min(h) as f32 * 0.2;
    let gap = r * 0.45;
    let (cx, cy) = (w as f32 - r - 0.5, r + 0.5);
    for y in 0..h {
        for x in 0..w {
            let i = ((y * w + x) * 4) as usize;
            let d = ((x as f32 + 0.5 - cx).powi(2) + (y as f32 + 0.5 - cy).powi(2)).sqrt();
            let px = &mut out[i..i + 4];
            if d <= r {
                px.copy_from_slice(&[dot[0], dot[1], dot[2], 255]);
            } else if d <= r + gap {
                px[3] = 0;
            } else {
                px[0] = glyph[0];
                px[1] = glyph[1];
                px[2] = glyph[2];
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn solid(w: u32, h: u32) -> Vec<u8> {
        (0..w * h).flat_map(|_| [0, 0, 0, 200]).collect()
    }

    fn px(img: &[u8], w: u32, x: u32, y: u32) -> [u8; 4] {
        let i = ((y * w + x) * 4) as usize;
        [img[i], img[i + 1], img[i + 2], img[i + 3]]
    }

    #[test]
    fn us_inst_14_parses_token_colours() {
        assert_eq!(parse_hex("#c4262b"), Some([196, 38, 43]));
        assert_eq!(parse_hex(" #8B5CF6 "), Some([139, 92, 246]));
        assert_eq!(parse_hex("red"), None);
        assert_eq!(parse_hex("#fff"), None);
    }

    #[test]
    fn us_inst_14_paused_is_half_opacity() {
        let img = faded(&solid(2, 2), 0.5);
        assert!(img.chunks_exact(4).all(|p| p[3] == 100));
    }

    #[test]
    fn us_inst_14_the_dot_sits_top_right_with_a_gap_around_it() {
        let (w, h) = (36, 36);
        let img = with_dot(&solid(w, h), w, h, [255, 255, 255], [196, 38, 43]);
        // The dot's centre.
        assert_eq!(px(&img, w, 28, 7), [196, 38, 43, 255]);
        // The ring around it is see-through.
        assert_eq!(px(&img, w, 20, 7)[3], 0);
        // The glyph elsewhere takes the menu bar's text colour, keeping its opacity.
        assert_eq!(px(&img, w, 4, 30), [255, 255, 255, 200]);
    }
}
