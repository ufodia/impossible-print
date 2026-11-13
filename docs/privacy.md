# Images stay in the studio on your device

Impossible Print 0.1.0 processes selected images, text artwork, geometry and print rasters in your browser. The application code has no artwork-upload endpoint, account system, analytics integration or remote project storage.

## What the application reads

The browser reads an image only after you choose it through **Upload image**, or a project after **Open project**. Text artwork is drawn to a local canvas. The studio's camera is a virtual mathematical viewpoint; it does not request webcam, microphone or location permission.

The hosted page still downloads its application assets from its hosting provider. Opening GitHub or Buy Me a Coffee links contacts those services under their own policies. This application-level description does not promise that a hosting provider or browser produces no ordinary access logs.

## What you keep or share

| Artifact           | Contains                                                                       |
| ------------------ | ------------------------------------------------------------------------------ |
| Saved project JSON | Name, original raster data and measured settings                               |
| Floor/wall PNG     | Generated distorted artwork pixels                                             |
| Assembly plan      | Both generated textures, project name, measurements and placement instructions |

Review these artifacts before sharing. Project files include the original selected image, which can contain private visual information. The application does not provide a metadata-stripping guarantee for the embedded original file. Generated raster outputs describe the artwork and can disclose it visually.

Unsaved state lives in the current page. Save a project file to retain work and keep exports in a location you control. Closing the page releases its working state; it does not delete files you already downloaded.

## Print-plan boundary

The generated assembly HTML embeds both PNGs and can display without network requests. Its print control opens the browser's print dialog. Printer drivers, destination selection and any cloud-print or PDF service you choose are outside the application's control.

## Reporting an issue

Use a synthetic image and minimal reproduction when filing a public issue. Do not attach private photographs or project files without reviewing their contents. See [security reporting](../SECURITY.md) for sensitive findings.
