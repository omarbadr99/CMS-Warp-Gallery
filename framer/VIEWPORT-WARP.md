# Viewport Warp Gallery (CMS)

`ViewportWarpGallery.tsx` — a variant where the warp only happens at the top and
bottom lips of the viewport, and the images come from a CMS Collection.

## How it differs

| | WarpGallery | ViewportWarpGallery |
|---|---|---|
| Warp | whole viewport curves, middle pinched | middle band is pristine, only the lips distort |
| Content | rows authored by hand | one CMS item per instance, grouped by Gallery ID |
| Link | one per row | one per item, bindable to a CMS field |

## Setting it up

1. Add a **Collection List** bound to your collection.
2. Put **one** ViewportWarpGallery inside the list's cell.
3. Bind **Image**, **Title** and **Link** to CMS fields — click the `+` next to
   each property and choose *Set Variable*.
4. Leave **Gallery ID** as `default`, or give separate galleries separate IDs.
5. Set the layout on the instance: **Columns**, **Pattern**, gaps, padding.

Every instance sharing a Gallery ID registers into one shared list. The first
instance in document order draws the whole gallery; the rest collapse to zero
height, so the list contributes no extra space. Order follows the Collection
List's own order, so sorting and filtering in Framer carry through.

**Pattern** is one line per row, and the grid repeats until every item is
placed:

```
0*0
**0
0**
```

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

- **Edge band** (0.15) — how far in from each lip the warp reaches. Everything
  between stays flat. Larger values distort more of the screen.
- **Intensity** (1.3) — how hard a given scroll speed warps.
- **Resting curl** (0.02) — what remains when still. 0 is velocity-only.
- **Dispersion** (0.12, up to 0.6) — prismatic spread on the rolled edges.
- **Angle** (0.35) — how far the surface rolls at the lip. 1 is a quarter turn.
- **At the lip** — *Shrink*: tiles are smallest at the edge and open up as they
  reach the middle. *Grow*: the reverse, tiles are largest at the edge.
- **Space before / Space after** (0) — clear screens before the first row and
  after the last, in viewport heights. Set both to 1 to watch images enter from
  off-frame and leave completely.

## Performance

Same work as the sibling component: no layout reads in the render loop, edge
anti-aliasing in the shader rather than MSAA, adaptive render scale, idles when
nothing moves and stops entirely off screen.
