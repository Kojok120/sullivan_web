
import sharp from 'sharp';
import jsQR from 'jsqr';
import fs from 'fs';
import path from 'path';

async function testQR(filePath: string) {
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        return;
    }

    console.log(`Testing ${filePath}...`);
    const image = sharp(filePath);
    const metadata = await image.metadata();
    console.log(`Dims: ${metadata.width}x${metadata.height}, Channels: ${metadata.channels}`);

    // Strategy 1: Crop Top-Right (Assuming Header QR)
    // QR is typically in top 15% height, right 30% width?
    // Let's take Top 20%, Right 30%.
    const cropWidth = Math.floor(metadata.width! * 0.35);
    const cropHeight = Math.floor(metadata.height! * 0.20);
    const left = metadata.width! - cropWidth;

    console.log(`Cropping area: ${cropWidth}x${cropHeight} at ${left},0`);

    const { data, info } = await image
        .extract({ left: left, top: 0, width: cropWidth, height: cropHeight })
        .resize({ width: 600 }) // sufficient for QR
        .ensureAlpha() // FORCE RGBA (4 channels)
        .raw()
        .toBuffer({ resolveWithObject: true });

    console.log(`Processed: ${info.width}x${info.height}, Channels: ${info.channels}, Size: ${data.length}`);

    if (data.length !== info.width * info.height * 4) {
        console.error("CHANNEL MISMATCH! expected 4 channels");
        return;
    }

    const code = jsQR(new Uint8ClampedArray(data), info.width, info.height);
    if (code) {
        console.log("SUCCESS! Data:", code.data);
    } else {
        console.log("FAILURE to read QR.");
        // Save debugging image
        await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
            .toFile('debug-qr-crop.png');
        console.log("Saved debug-qr-crop.png");
    }
}

// Try to find a file to test
// If no file exists, just syntax check or unit test logic.
const archiveDir = path.join(process.cwd(), 'archive');
const files = fs.readdirSync(archiveDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
if (files.length > 0) {
    testQR(path.join(archiveDir, files[0]));
} else {
    console.log("No files in archive to test.");
}
