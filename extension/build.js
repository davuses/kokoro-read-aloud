const fs = require("fs");
const path = require("path");
const merge = require("deepmerge");

const target = process.argv[2] || "chrome";
const distDir = `dist-${target}`;
const isFirefox = target === "firefox";

const publicDir = "public";
const srcDir = "src";

// Clean previous build
if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true });
fs.mkdirSync(distDir, { recursive: true });

// Load and merge manifest
const baseManifest = JSON.parse(fs.readFileSync("manifest.base.json", "utf-8"));
let overrideManifest = {};

const overridePath = `manifest.${target}.json`;
if (fs.existsSync(overridePath)) {
  overrideManifest = JSON.parse(fs.readFileSync(overridePath, "utf-8"));
}

const finalManifest = merge(baseManifest, overrideManifest);
if (isFirefox) {
  // Firefox uses MV2: drop the MV3 `action` key (replaced by `browser_action`
  // from the override) and replace `background` wholesale so the merge doesn't
  // leave the MV3 `service_worker`/`type` keys alongside the MV2 `scripts`.
  delete finalManifest.action;
  finalManifest.background = overrideManifest.background;
}
fs.writeFileSync(
  path.join(distDir, "manifest.json"),
  JSON.stringify(finalManifest, null, 2)
);

// Copy public assets (popup, styles, icons, tts lib)
const copyRecursive = (src, dest) => {
  if (!fs.existsSync(src)) return;
  fs.readdirSync(src).forEach((file) => {
    const srcPath = path.join(src, file);
    const destPath = path.join(dest, file);
    if (fs.lstatSync(srcPath).isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  });
};

copyRecursive(publicDir, distDir);

// Shared constants/helpers. There's no bundler, so we inline this into both the
// background script and the popup (overwriting the copy made above). This keeps
// one source of truth while emitting plain scripts that work in Chrome's module
// service worker and Firefox's classic MV2 background alike.
const shared = fs.readFileSync(path.join(srcDir, "shared.js"), "utf-8");
const prependShared = (srcPath, destPath) => {
  fs.writeFileSync(destPath, `${shared}\n${fs.readFileSync(srcPath, "utf-8")}`);
};

prependShared(
  path.join(srcDir, "background.js"),
  path.join(distDir, "background.js")
);
prependShared(
  path.join(publicDir, "popup.js"),
  path.join(distDir, "popup.js")
);

// Copy content script (standalone — it doesn't use the shared helpers)
fs.copyFileSync(
  path.join(srcDir, "content.js"),
  path.join(distDir, "content.js")
);

console.log(`✅ Built ${target} extension → ${distDir}/`);
