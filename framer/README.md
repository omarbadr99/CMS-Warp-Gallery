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

## Layout notes

- Give the component a **full-width** frame. Height is content-driven, so leave
  it on **auto** — do not set a fixed height.
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

The warp is disabled on the Framer canvas so the editor stays responsive. Open
**Preview** to see the effect.
