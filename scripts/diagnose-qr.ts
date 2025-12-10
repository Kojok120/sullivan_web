
import sharp from 'sharp';
import jsQR from 'jsqr';
import fs from 'fs';
import path from 'path';

async function diagnose() {
    const filePath = path.join(process.cwd(), 'tmp', '20251211015825_001.jpg');
    if (!fs.existsSync(filePath)) {
        console.error("File not found:", filePath);
        return;
    }

    const debugDir = path.join(process.cwd(), 'debug_output');
    if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);

    console.log(`Diagnosing ${filePath}...`);
    const image = sharp(filePath);
    const metadata = await image.metadata();

    const cropW = Math.floor(metadata.width! * 0.35);
    const cropH = Math.floor(metadata.height! * 0.25);

    const crops = [
        { name: "Top-Right", left: metadata.width! - cropW, top: 0 },
        { name: "Top-Left", left: 0, top: 0 },
        { name: "Bottom-Right", left: metadata.width! - cropW, top: metadata.height! - cropH },
        { name: "Bottom-Left", left: 0, top: metadata.height! - cropH },
    ];

    for (const crop of crops) {
        console.log(`Processing ${crop.name} ...`);
        // Create a base pipeline
        const pipeline = image
            .clone()
            .extract({ left: crop.left, top: crop.top, width: cropW, height: cropH })
            .resize({ width: 800 })
            .normalize()
            .toColourspace('srgb')
            .ensureAlpha(); // RGBA

        // 1. Get RAW buffer for jsQR
        const { data, info } = await pipeline.clone().raw().toBuffer({ resolveWithObject: true });

        // 2. Save PNG for Debugging
        await pipeline.clone().png().toFile(path.join(debugDir, `debug_${crop.name}.png`));
        console.log(`Saved debug_${crop.name}.png`);
        console.log(`Saved debug_${crop.name}.png`);

        const code = jsQR(new Uint8ClampedArray(data), info.width, info.height);
        if (code) {
            console.log(`SUCCESS in ${crop.name}:`, code.data);
        } else {
            console.log(`FAILED in ${crop.name}`);
        }
    }
}

diagnose();
