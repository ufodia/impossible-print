# Deploy the static studio

Impossible Print is a static browser application. Hosting it publishes the editor and its sample assets; it does not add an image-upload service, webcam access or shared project storage.

## Reproduce the output

Use Node.js 24 and the committed lockfile:

```sh
npm ci
npm run verify
```

The build type-checks the application and emits `dist/`. Three.js is loaded as a separate preview module. The initial studio and its raster/print functionality remain independent of successful WebGL creation.

Use `npm run preview` to inspect the built application locally. No application environment variables or backend credentials are required.

## Vercel configuration

Import the repository with `main` as the production branch. Keep the tracked `vercel.json`: Vite preset, `npm ci` installation, `npm run build` and `dist` output. Confirm the deployment's source commit matches the checked GitHub `main` SHA.

After publication, open the actual production address and verify the sample, camera/orbit views, a measurement edit, project download and A4 print plan. Check the source and support links. A successful local build or this configuration file alone is not evidence of a live deployment.

Production discovery files must describe the verified production URL. Do not submit preview deployment addresses or private user-generated projects for indexing. Hosting does not turn downloaded projects into public documents automatically.
