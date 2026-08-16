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
follow. That lag is the velocity signal. It feeds a vertex shader that pulls
every vertex toward the centre of the viewport:

```glsl
vec2 d  = p - 0.5;
float r2 = dot(vec2(d.x * uAspect, d.y), vec2(d.x * uAspect, d.y));
float k  = uWarp * (0.45 + 1.60 * r2);
p = 0.5 + d * (1.0 - k);
```

The constant term is a near-uniform pull; the `r2` term is what bends each tile,
so images near the centre stay square while those at the edges shear and curve.
Tiles are drawn as 14x14 subdivided quads so the bend stays smooth.

Warp magnitude uses the absolute velocity, so scrolling up and down distort
identically. Attack is faster than release: the distortion snaps in and eases
out.

## Accessibility

- Row links are mirrored into a visually hidden `nav` so they are reachable by
  keyboard and screen reader.
- The scroll container is focusable and scrolls with the keyboard.
- Warp defaults to off when the system requests reduced motion.
