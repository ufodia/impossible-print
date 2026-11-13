# Build your first corner illusion

Use this guide with Impossible Print 0.1.0. You need a modern browser, a flat wall/tabletop corner, a ruler or tape measure, an A4 printer and paper. The corner must be close to 90°. Start small enough to inspect and reposition by hand.

## Explore before printing

Start the studio with the [README setup commands](../README.md). The original sample loads automatically. Wait for **Projection ready**, then use **Orbit overview** to see how the image is divided between the wall and floor. Drag to orbit and scroll to zoom. **Camera view** restores the measured viewing position.

The 3D camera is a virtual viewpoint. The studio does not open your webcam or infer measurements from a photograph.

## Bring an image

Choose **Upload image** for a local PNG, JPEG or WebP. Images must be no larger than 8 MiB, 4,096 pixels on either side or 12 megapixels in total. Clear shapes and bold lettering make a useful first experiment. Transparent padding is supported.

Alternatively, enter up to 60 characters in **Artwork text** and choose **Create text**. The studio draws those words into a local 1,200 × 800 pixel canvas image. **Load sample** returns to the original artwork; replacing unsaved work asks for confirmation.

## Measure the corner

All physical measurements use millimetres:

1. Set **Surface width** to the common left-to-right width of both surfaces.
2. Set **Floor depth** from the wall outward across the tabletop or floor.
3. Set **Wall height** upward from the seam.
4. Mark the centre of the seam. This is the target of the viewing direction.

The studio models two finite rectangles. Their common width is centred on that target. It does not model a second side wall, an uneven join or a curved backdrop.

## Choose the viewing point

Set **Distance from wall** outward from the seam and **Height above floor** above the horizontal surface. Set **Lateral offset (+ left)** relative to the seam centre: positive values move the viewing point left as you face the wall; negative values move it right.

Aim your eventual eye or camera position toward the centre of the seam. Keep these measurements available when you install the print. The virtual view helps you understand the geometry; it does not estimate or match your camera's lens distortion.

## Review the projection

**Artwork width** is the width of the virtual image plane centred at the seam. Changing it changes the source's projected footprint across both surfaces.

With **Auto-fit artwork to the surfaces** checked, the engine can shrink that requested width until the footprint fits. It never enlarges the requested artwork. Read **Artwork fit scale** to see how much of the requested size remains.

With auto-fit off, a large image or oblique viewpoint can extend beyond the selected surfaces. **Clipped source estimate** samples the source-image area on a 48 × 48 grid, including transparent padding. Inspect both surface previews rather than treating that percentage as a precision measurement.

**Requested print resolution** accepts 40–150 DPI. The output's combined 6 megapixel and 4,096-pixel-side budgets can lower **Effective raster DPI**. Physical size stays measured in millimetres even when effective resolution falls.

Edits rebuild the surfaces automatically. **Update projection** also rebuilds them explicitly. Wait for the completion message before downloading or printing.

## Save your work

Choose **Save project** to download a `.impossible-print.json` file. It contains the original raster image, project name and physical settings. Reopen it through **Open project**. Keep that file if you want to reproduce or revise the installation; the browser page is not a durable project archive.

**Download floor PNG** and **Download wall PNG** save the already distorted rasters. Their pixel dimensions do not by themselves instruct every image editor or printer to use the intended physical size. Use the assembly plan for measured printing.

## Print at the intended scale

Choose **Print A4 sheets**. Allow the print-plan popup if your browser blocks it, then choose **Print assembly plan** in that new page.

Use A4 portrait, 10 mm margins and **100% / Actual size**. Disable browser headers and footers. Avoid a print dialog's “fit to page” scaling. The plan contains one setup sheet followed by numbered wall and floor tiles. Each tile's artwork area is 190 × 267 mm; the setup and tile pages carry a calibration ruler.

Print one page first. The line labelled **This line must measure 100 mm** must measure 100 mm on paper. Correct print settings before printing or assembling the rest.

## Assemble and reveal

1. Keep every sheet upright. Join matching row/column tiles within the **WALL** and **FLOOR** groups at the marked tile boundaries.
2. Place the wall print upright. Its **bottom** edge is the seam edge.
3. Place the floor print with its **top** edge against that same seam. Match horizontal columns across the join. Do not mirror either print.
4. Keep the two physical surfaces at 90°, flat and measured to the plan's sizes.
5. Position your eye or camera at the recorded lateral offset, distance and height. Aim at the seam centre.
6. Compare the reconstruction with **Camera view**, then adjust the physical setup carefully.

Printer scale, paper stretch, imperfect angles and lens distortion can all affect the result. This version has no automatic calibration or physical-installation certification.

## Troubleshooting

| Symptom                                      | Check                                                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 3D preview is unavailable                    | Use a browser with WebGL enabled. The 2D warped images and print plan still work.                                             |
| The image is incomplete                      | Reduce artwork width, enable auto-fit, increase surface sizes or adjust the viewing point. Inspect estimated clipping.        |
| The two halves face opposite directions      | Keep both sheets upright: floor top meets wall bottom. Do not mirror the rasters.                                             |
| Printed size is wrong                        | Measure the 100 mm ruler; turn off fit-to-page and browser headers/footers.                                                   |
| Print plan does not open                     | Allow this studio's popup and choose **Print A4 sheets** again.                                                               |
| An import is rejected                        | Check the supported formats, source limits and version 1 [project schema](reference.md). SVG and remote URLs are unsupported. |
| Physical reconstruction differs from preview | Recheck the seam centre, 90° angle, camera point, paper placement and lens perspective.                                       |
