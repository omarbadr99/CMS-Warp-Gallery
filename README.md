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
| Warp effect | Intensity | multiplier on the distortion |

## How the warp works

The rendered scroll position lags behind the real `scrollTop` by a damped
follow. That lag is the velocity signal. It feeds a vertex shader that distorts
every tile in screen space:

```glsl
vec2  d  = p - 0.5;                      // normalised, NOT aspect-inflated
float r2 = dot(d, d);                    // 0 at centre .. 0.5 at the corners

float kx   = uWarp * 0.95;               // near-uniform horizontal pull
float ky   = uWarp * (0.55 + 0.90 * r2); // vertical pull, grows outward
float skew = -2.10 * uWarp * d.x * d.y;  // shears tiles into parallelograms

p = 0.5 + vec2(d.x * (1.0 - kx), d.y * (1.0 - ky) + skew);
```

Three terms, each doing one job:

- **kx** is constant across the frame, so the grid shrinks toward the centre but
  stays rectangular and still reaches the left and right edges.
- **ky** grows with radius, which bows the rows.
- **skew** is what tilts each tile. A pure scale toward the centre can only
  shrink tiles, never shear them — without this term the distortion reads as a
  zoom rather than a warp.

Two things matter for keeping the grid from collapsing into a ball: the radius
must not be aspect-inflated (`d.x * aspect` blows the corners out on a wide
viewport), and `ky`'s radial coefficient must stay low relative to its constant
term, or tiles get crushed vertically at the top and bottom of the frame.

Tiles are drawn as 14x14 subdivided quads so the bend stays smooth.

Warp magnitude uses the absolute velocity, so scrolling up and down distort
identically. Attack is faster than release: the distortion snaps in and eases
out.

## Accessibility

- Row links are mirrored into a visually hidden `nav` so they are reachable by
  keyboard and screen reader.
- The scroll container is focusable and scrolls with the keyboard.
- Warp defaults to off when the system requests reduced motion.
