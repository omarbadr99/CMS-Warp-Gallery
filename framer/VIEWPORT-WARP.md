# Viewport Warp Gallery (CMS)

`ViewportWarpGallery.tsx` — a variant where the warp only happens at the top and
bottom lips of the viewport, and the images come from a CMS Collection.

## How it differs

| | WarpGallery | ViewportWarpGallery |
|---|---|---|
| Warp | whole viewport curves, middle pinched | middle band is pristine, only the lips distort |
| Content | rows authored by hand | one CMS item per row, grouped by Gallery ID |
| Link | one per row | one per item, bindable to a CMS field |

## Setting it up

The file exports **two** components. Both appear in Assets once you paste it in.

| Component | Where it goes |
|---|---|
| **Warp Gallery Item** | inside the Collection List |
| **Viewport Warp Gallery** | on the page, **outside** the list |

1. Add a **Collection List** bound to your collection.
2. Put **one Warp Gallery Item** inside the list's cell. Bind **Image**,
   **Title** and **Link** to CMS fields — click the `+` next to each property
   and choose *Set Variable*. It draws nothing on the live page; on the canvas
   it shows a small chip so you can still select it.
3. Drop **one Viewport Warp Gallery** on the page, outside the list, and set
   its width to **Fill**.
4. Give both the same **Gallery ID**. Separate galleries get separate IDs.
5. Set the layout on the gallery: **Columns**, **Pattern**, gaps, padding.

### Why two components

A component inside a Collection List is trapped in one grid cell. It can only
ever be as wide as that cell, so a gallery placed inside the list can never go
full width no matter what its own width is set to. The item reports its CMS row;
the gallery, which lives on the page, draws them all.

If the gallery still does not span the window because the section around it has
padding or a max width, turn on **Full Bleed**.

**Pattern** is one line per row, one character per column, and the grid repeats
until every item is placed:

```
0*0
**0
0**
```

A pattern is written against a specific column count — `0*0` means nothing at
two columns — so **Tablet** and **Phone** carry their own column count and their
own pattern. Leave a breakpoint pattern empty to simply fill every column.

### Picking the right items

Framer keeps a copy of the page in the DOM for every breakpoint: hidden ones on
a published site, side-by-side frames on the canvas. A registry keyed only by
Gallery ID would therefore collect each CMS row once per breakpoint and show
everything two or three times over. The gallery instead keeps only the rows
whose nearest shared ancestor with itself is closest, which picks the single
copy that belongs to it in both cases.

### If WebGL cannot run

If the browser gives no WebGL context, or the images come from a host that
sends no CORS headers (the GPU is not allowed to read those), the gallery falls
back to a plain grid of linked images — no warp, but never a blank page.

## The warp

The page is wrapped on a horizontal cylinder and the viewer sits just inside it.
Through the middle band the surface is flat; at each lip it rolls away.

```glsl
float m = min(p.y, 1.0 - p.y);
float phiMax = uAngle * 1.5707963 * clamp(amt * 2.2, 0.0, 1.0);
if (m < band && phiMax > 0.0005) {
  float u    = m / band;                  // 1 at the band edge, 0 at the lip
  float phi  = (1.0 - u) * phiMax;
  float roll = sin(phi) / sin(phiMax);    // arc length -> what the eye sees
  float mNew = band * (1.0 - roll);       // spacing bunches toward the lip
  float depth = 1.0 - cos(phi);
  float sx = 1.0 / (1.0 + uDir * depth * 0.40);
  ...
}
```

The vertical term is the one that matters. A point's arc length along the
surface grows linearly, but its **projection** grows as `sin(phi)`, so spacing
bunches up as the surface turns edge-on. Scaling a tile alone only ever looks
squashed — compressing the spacing is what makes it read as rolling.

`phiMax` is the roll angle at the lip, so **Angle** of 1 is a full quarter turn.

**This model is near-identity at small angles and that is easy to get wrong.**
For small `phi`, `sin(phi)/sin(phiMax)` tends to `phi/phiMax` — exactly linear,
so there is no compression at all — and `1 - cos(phi)` tends to `phi^2/2`, which
vanishes. Below roughly 30 degrees the whole effect is invisible: at 19 degrees
it is a 3.8% width change and a 2.6% spacing shift. `phiMax` has to reach the
45-65 degree range at a normal scroll for anything to be visible, which is why
the velocity ramp saturates early (`clamp(amt * 6.0, 0.0, 1.0)`) rather than
scaling gently.

## Dispersion

Eight samples are taken across the smear and each is weighted by a wavelength,
so the result resolves into a continuous spectrum rather than a two-tone fringe:

```glsl
for (int i = 0; i < 8; i++) {
  float s = float(i) / 7.0;
  vec3  w = spectrum(s);
  sum  += texture(uTex, vUv + off * (s - 0.5) * 2.0).rgb * w;
  wsum += w;
}
c.rgb = sum / wsum;
```

The offset scales with distance from the tile's centre and with `vEdge`, so it
is zero mid-image, strongest at the left and right edges, and gone entirely once
the tile leaves the band. Push past 0.3 for a heavy prism.

The eight samples are guarded by `if (amount > 0.0005)`, so only fragments
actually inside the warp band pay for them.

## Dials

- **Columns** / **Tablet** / **Phone** — column count, with optional overrides
  under 1000px and 600px. `0` on a breakpoint keeps the desktop count.
- **Full Bleed** — span the window, ignoring the padding or max width of the
  section the gallery sits in.
- **Edge band** (0.15) — how far in from each lip the warp reaches. Everything
  between stays flat. Larger values distort more of the screen.
- **Intensity** (1.3) — how hard a given scroll speed warps.
- **Resting curl** (0.02) — what remains when still. 0 is velocity-only.
- **Dispersion** (0.12, up to 0.6) — prismatic spread on the rolled edges.
- **Angle** (0.70) — how far the surface rolls at the lip; 1 is a quarter turn.
  Values below ~0.35 do almost nothing, see the note above.
- **At the lip** — *Shrink*: tiles are smallest at the edge and open up as they
  reach the middle. *Grow*: the reverse, tiles are largest at the edge.
- **Space before / Space after** (0) — clear screens before the first row and
  after the last, in viewport heights. Set both to 1 to watch images enter from
  off-frame and leave completely.

## Performance

Same work as the sibling component: no layout reads in the render loop, edge
anti-aliasing in the shader rather than MSAA, adaptive render scale, idles when
nothing moves and stops entirely off screen.
