const fs = require("fs");
const path = require("path");

// Path to the FFmpeg build.gradle file (Adjust path for your node_modules)
const ffmpegBuildGradlePath = path.join(
  __dirname,
  "../node_modules/ffmpeg-kit-react-native/android/build.gradle"
);

if (!fs.existsSync(ffmpegBuildGradlePath)) {
  console.error("❌ FFmpeg build.gradle file not found!");
  process.exit(1);
}

let content = fs.readFileSync(ffmpegBuildGradlePath, "utf8");

// 1. Replace the external dependency line with the local AAR implementation
const originalDependencyLine =
  "implementation 'com.arthenica:ffmpeg-kit-' + safePackageName(safeExtGet('ffmpegKitPackage', 'https')) + ':' + safePackageVersion(safeExtGet('ffmpegKitPackage', 'https'))";
const newDependencyLine =
  "implementation(name: 'ffmpeg-kit-full-gpl', ext: 'aar')";
content = content.replace(originalDependencyLine, newDependencyLine);

// 2. Ensure flatDir repository is added to the repositories block for local AAR access
if (!content.includes('flatDir { dirs "$rootDir/libs" }')) {
  content = content.replace(
    /repositories\s*{/,
    'repositories {\n flatDir { dirs "$rootDir/libs" }'
  );
}

// 3. Remove implementation from buildscript block (cleanup/prevention)
content = content.replace(
  /buildscript\s*{[\s\S]*?dependencies\s*{[\s\S]*?implementation\(name:\s*'ffmpeg-kit-full-gpl',\s*ext:\s*'aar'\)[\s\S]*?}[\s\S]*?}/g,
  (match) =>
    match.replace("implementation(name: 'ffmpeg-kit-full-gpl', ext: 'aar')", "")
);

fs.writeFileSync(ffmpegBuildGradlePath, content, "utf8");
console.log("✅ Successfully patched FFmpeg build.gradle file");