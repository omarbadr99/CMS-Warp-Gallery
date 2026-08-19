# Using the component in Framer

`WarpGallery.tsx` is a Framer **code component**. The HTML preview in `../preview`
cannot be opened in Framer — it is a standalone page. This file is the version
Framer runs.

## Install

1. In your Framer project, open the **Assets** panel (left sidebar).
2. Next to **Code**, click **+** and choose **New Code File**.
3. Name it `WarpGallery`.
4. Delete the starter code, paste the whole of `WarpGallery.tsx`, and save.
5. Drag the component from Assets onto your page.

## Set it up

Select the component and use the right-hand properties panel.

1. Under **Rows**, click **+** to add a row.
2. Inside the row, add **Images** — each one takes a picture and a title.
3. Set the row's **Pattern**: one character per column, `0` places an image and
   `*` leaves the cell empty. With 6 columns, `*0**0*` puts two images in
   columns 2 and 5.
4. Set the row's **Link**. Every image in that row opens it.

The pattern's filled-cell count should match the number of images in the row.
Extra images are ignored; extra `0`s are skipped.

## Scroll mode

The **Scroll** property picks how the gallery occupies the page, and it decides
which height setting to use.

| Scroll | Height | Behaviour |
|---|---|---|
| **With page** | Fit Content | The section is as tall as the whole gallery and warps as the page scrolls past it. Default. |
| **Inside section** | Viewport, Fixed or Fill | The section is one box and the gallery scrolls within it, page unaffected. |

Use **Inside section** when you want the gallery to be exactly one screen tall.
The two settings have to agree: "With page" on a Viewport height squeezes the
whole gallery into one screen of scrolling, and "Inside section" on Fit Content
falls back to a viewport-tall box.

## Layout notes

- Give the component a **full-width** frame.
- The canvas sticks to the viewport while the section scrolls past it, so the
  gallery needs to be taller than one screen for the warp to have room. Bigger
  **Image size** and **Gap Y** both add height.
- **Image size** is measured in column widths. Images grow into the empty cells
  beside them but never into the next image, so they cannot overlap. Sparser
  patterns give bigger pictures.

## CMS

Framer code components cannot query a Collection directly. Two options:

- **Bind per field.** With the component selected, each row's image and title
  fields can be connected to CMS fields the same way any property is, and the
  row's Link can point at a Collection page.
- **Manual rows.** For a portfolio where each row is one project, authoring the
  rows by hand is usually faster than wiring a Collection, since the row link
  is what carries the project identity.

## Canvas vs preview

On the Framer canvas the gallery draws as plain images at the correct size, so
the layout is accurate and the editor stays responsive. The WebGL warp only runs
in **Preview** and on the published site.

## Troubleshooting

**It collapses on Fit Content, or the height field is greyed out.** Update to the
current version of the file. Two earlier bugs caused this. The first build set
its height from inside the WebGL effect, which runs after Framer has measured.
The second still declared an explicit height on the root while every drawn
element was absolutely positioned — Framer's Fit Content measures *in-flow*
content, so it read zero. The height is now carried by a real in-flow spacer,
and the layout mode is no longer locked to auto, so you can pick Fixed instead.

**The warp does not run.** Check you are in Preview, not on the canvas, and that
**Warp** is on. The section also needs to be taller than one screen for the
effect to have any scroll to work with — raise **Image size** or **Gap Y**.

**Images do not appear.** They are drawn through WebGL, which needs the images to
be readable cross-origin. Images uploaded to Framer are fine; images hot-linked
from a third-party host may not be.
