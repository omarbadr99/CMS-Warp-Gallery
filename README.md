# CMS Warp Gallery

A Framer-ready gallery component: CMS-driven images laid out on a column grid,
with a WebGL warp effect driven by scroll velocity.

Unlike the reference component this one is **finite** — the gallery ends rather
than looping. Content is authored as **rows**: each row places a number of
images across the column grid and carries a single link that every image in
that row opens.

## Preview

`preview/warp-gallery-preview.html` is a self-contained working prototype with
every property control live, published as an artifact for review before the
component is ported to Framer.

Source images in the preview are generated procedurally so the file has no
external dependencies.

## Properties

| Group | Property | Range / options |
|---|---|---|
| Layout | Columns | 1–6 |
| Layout | Gap X / Gap Y | px |
| Layout | Padding | px |
| Layout | Image size | 1x-4x of a column width |
| Rows | Pattern | one cell per column; `0` places an image, `*` leaves it empty |
| Rows | Link | one URL per row |
| Text style | Font | Mono / Sans / Serif |
| Text style | Color | any |
| Text style | Index | show / hide |
| Text style | Gap | px between the title block and the image |
| Link | Open in new tab | on / off |
| Hover effect | — | Grayscale to Color · Color to Grayscale · Title Appear · None |
| Warp effect | Warp | on / off |
| Warp effect | Scroll speed | smoothing; lower trails further and warps deeper |
| Warp effect | Intensity | 0-3x multiplier on the distortion |

## How the warp works

The rendered scroll position lags behind the real `scrollTop` by a damped
follow. That lag is the velocity signal, and it drives a single uniform in the
vertex shader.

The page behaves as if it were wrapped around a **horizontal cylinder seen from
the inside**. The middle band of the viewport is the far side of that cylinder
and recedes; the top and bottom edges are the near side and come forward:

```glsl
float u = clamp(2.0 * d.y, -1.0, 1.0);   // -1 top .. 0 middle .. +1 bottom
float c = 1.0 - u * u;                   //  1 at mid-height .. 0 at the edges

float sx = max(1.0 - uWarp * 0.62 * c, 0.40);   // horizontal pinch at mid-height

float kv = min(uWarp * 2.4, 0.88);              // vertical foreshortening
float uv = u / (1.0 + kv * u * u);

p = 0.5 + vec2(d.x * sx, uv * 0.5);
```

Two signatures come out of this, and both are visible in the reference:

- **The waist pinches.** `sx` is smallest at mid-height, so the middle of the
  viewport draws narrower while the top and bottom keep full width.
- **Rows squash into slivers at the top and bottom.** Near the edges the
  surface turns edge-on to the eye, so bands foreshorten hard as they approach.

`uv = u / (1 + k*u^2)` is chosen for one property: its slope at `u = 0` is
exactly 1, so the middle band is never stretched vertically — it only bends. An
earlier `1 - pow(1 - |u|, e)` curve had slope `e` at the centre, which stretched
the middle by up to 1.9x while the pinch narrowed it, and the result read as
smearing rather than curving. `k` is capped below 1 because the edge derivative
`(1 - k)/(1 + k)^2` reaches zero at `k = 1`, where rows would fold back on
themselves.

Both terms are **even in x**. That is deliberate: any term odd in x (a
`d.x * d.y` skew, for instance) makes the whole grid read as tilting to one
side rather than curving, which is the single most obvious way to get this
effect wrong.

Tiles are drawn as 14x14 subdivided quads so the curve stays smooth.

## Image size

Images are sized in column widths, and may grow past their own column into the
empty cells beside them — but never into the next image in the row, so they can
never overlap. Sparser patterns therefore give bigger pictures, and bigger
pictures mean taller rows, fewer rows per screen, and more scroll distance for
the warp to play out over.

Warp magnitude uses the absolute velocity, so scrolling up and down distort
identically. Attack is faster than release: the curve snaps in and eases back
flat when the scroll stops.

## Accessibility

- Row links are mirrored into a visually hidden `nav` so they are reachable by
  keyboard and screen reader.
- The scroll container is focusable and scrolls with the keyboard.
- Warp defaults to off when the system requests reduced motion.
