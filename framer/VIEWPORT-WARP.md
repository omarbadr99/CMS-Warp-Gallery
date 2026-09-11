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

`e` is 0 everywhere outside the edge band and rises to 1 at the very lip, so a
tile is untouched until it reaches the top or bottom of the viewport:

```glsl
float e = 1.0 - clamp(min(p.y, 1.0 - p.y) / band, 0.0, 1.0);
e = e * e * (3.0 - 2.0 * e);
vEdge = e * (uWarp + uRest);

float shrink = vEdge * 0.30;
vec2 t = aPos - 0.5;                      // tile space, not screen space
p = (uRect.xy + vec2((0.5 + t.x * (1.0 - shrink)) * uRect.z,
                     (0.5 + t.y * (1.0 - shrink * 0.35)) * uRect.w)) / uRes;
```

The taper is applied in **tile space**, which is the detail that makes it read
correctly. Measuring a card in the reference closeup: as it enters from below
its left edge moves +24px right while its right edge moves -22px left — it
narrows about its own centre, not the screen's. Applying the same taper in
screen space instead makes it look like the whole viewport is being lensed,
which is wrong.

Because `e` varies down the tile's own height, the near-lip end shrinks more
than the far end, so the sides curve and the tile reads as tipping away.

## Dispersion

The warped edges get a chromatic split. `vEdge` is carried into the fragment
shader, and red and blue are sampled apart along the tile's own x axis:

```glsl
vec2 off = vec2((vUv.x - 0.5) * 2.0, 0.0) * vEdge * uDisp;
c.r = texture(uTex, vUv + off).r;
c.b = texture(uTex, vUv - off).b;
```

The offset scales with distance from the tile's centre, so it is zero in the
middle of an image and strongest at the left and right edges — exactly where
the taper is doing the most work. It also scales with `vEdge`, so it fades out
completely once the tile leaves the band.

## Dials

- **Edge band** (0.15) — how far in from each lip the warp reaches. Everything
  between stays flat. Larger values distort more of the screen.
- **Intensity** (1.3) — how hard a given scroll speed warps.
- **Resting curl** (0.02) — what remains when still. 0 is velocity-only.
- **Dispersion** (0.06) — how far red and blue split on the warped edges.
- **Angle** (0.30) — how hard a tile tapers once it reaches the lip.
- **At the lip** — *Shrink*: tiles are smallest at the edge and open up as they
  reach the middle. *Grow*: the reverse, tiles are largest at the edge.
- **Space before / Space after** (0) — clear screens before the first row and
  after the last, in viewport heights. Set both to 1 to watch images enter from
  off-frame and leave completely.

## Performance

Same work as the sibling component: no layout reads in the render loop, edge
anti-aliasing in the shader rather than MSAA, adaptive render scale, idles when
nothing moves and stops entirely off screen.
