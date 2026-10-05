# HPLC Simulator

A browser-based model of isocratic and gradient HPLC separations. It includes interactive chromatograms, compound selection, column and mobile-phase controls, contextual help, and method/data export.

This repository contains only HPLC Simulator and the shared styling needed to run it. The other application, full website, contact service, old website backup, screenshots, and private configuration are not included.

## Run locally

The built application is in `public/`. No Java, package installation, or build step is required to run it. Serve it locally with Python:

```
python -m http.server 8000 --directory public
```

Then open http://localhost:8000/.

## Edit and build

- `public/assets/simulator/`: application source, data, and styles.
- `simulator/workspace.html`: application page template.
- `public/assets/site.css`: shared page styles.
- `build.py`: generates `public/index.html` and asset cache versions.

After editing, run:

```
python build.py
```

The build uses Python's standard library and has no dependencies on the original Eclipse workspaces or the full website. The generated HTML is committed for immediate use.

## Tests

Run from the repository root with Node.js:

```
node  --test tests/model.test.js
node tests/plot-interactions.cjs
```

The reference fixtures are included. Tests do not require Java or external services. Numerical agreement with the original model is not validation against experimental measurements.

## Hosting

Deploy the `public` directory to a static web host. For Cloudflare Pages, use `python build.py` as the build command and `public` as the output directory. This application has no server-side functions.

## License and attribution

The original software license, CC BY-NC-SA 3.0 US, is retained. See `LICENSE` and `NOTICE`.
