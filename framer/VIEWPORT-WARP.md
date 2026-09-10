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
float amt = uWarp + uRest;
p.x  = 0.5 + d.x * (1.0 + amt * e * 0.18);      // spreads toward the lip
p.y += dir * amt * e * d.x * d.x * 0.18;        // outer corners dip inward
```

Measured off the reference: a tile at the lip keeps a dead-vertical edge where
it crosses the middle of the screen and tapers outward toward the sides, with
its horizontal edges staying straight. So the dominant term is a horizontal
spread, with only a small quadratic dip. Both terms are even in x, so the grid
cannot tilt to one side.

`amt` is `uWarp + uRest`. `uWarp` comes from scroll velocity, so the effect
scales with how hard you scroll; `uRest` is what remains when the scroll stops
and defaults to nearly nothing, matching the reference.

## Dials

- **Edge band** (0.15) — how far in from each lip the warp reaches. Everything
  between stays flat. Larger values distort more of the screen.
- **Intensity** (1.3) — how hard a given scroll speed warps.
- **Resting curl** (0.02) — what remains when still. 0 is velocity-only.

## Performance

Same work as the sibling component: no layout reads in the render loop, edge
anti-aliasing in the shader rather than MSAA, adaptive render scale, idles when
nothing moves and stops entirely off screen.
