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

// Copy correct background script
const backgroundFile = "background.js";
fs.copyFileSync(
  path.join(srcDir, backgroundFile),
  path.join(distDir, "background.js")
);

// Copy content script
fs.copyFileSync(
  path.join(srcDir, "content.js"),
  path.join(distDir, "content.js")
);

console.log(`✅ Built ${target} extension → ${distDir}/`);
