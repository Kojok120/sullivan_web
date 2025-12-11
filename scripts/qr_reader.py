
import sys
import os

# Try to import pyzbar first (more reliable), fall back to OpenCV
try:
    from pyzbar.pyzbar import decode
    from PIL import Image
    PYZBAR_AVAILABLE = True
except ImportError:
    PYZBAR_AVAILABLE = False

import cv2

print(f"[QR] Python version: {sys.version}", file=sys.stderr)
print(f"[QR] OpenCV version: {cv2.__version__}", file=sys.stderr)
print(f"[QR] Pyzbar available: {PYZBAR_AVAILABLE}", file=sys.stderr)

def read_qr(image_path):
    if not os.path.exists(image_path):
        print(f"[QR] File not found: {image_path}", file=sys.stderr)
        return None

    # ===== Method 0: PYZBAR (Most Reliable) =====
    if PYZBAR_AVAILABLE:
        try:
            img = Image.open(image_path)
            results = decode(img)
            if results:
                data = results[0].data.decode('utf-8')
                print(f"[QR] Method 0 (Pyzbar) success", file=sys.stderr)
                return data
            print(f"[QR] Pyzbar found no QR codes", file=sys.stderr)
        except Exception as e:
            print(f"[QR] Pyzbar error: {e}", file=sys.stderr)

    # ===== OpenCV Methods (Fallback) =====
    img = cv2.imread(image_path)
    if img is None:
        print(f"[QR] Failed to read image: {image_path}", file=sys.stderr)
        return None

    print(f"[QR] Image loaded: {img.shape}", file=sys.stderr)

    # Method 1: Standard QRCodeDetector on original image
    detector = cv2.QRCodeDetector()
    data, bbox, _ = detector.detectAndDecode(img)
    if data:
        print(f"[QR] Method 1 (Standard) success", file=sys.stderr)
        return data

    # Method 2: Try on grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    data, bbox, _ = detector.detectAndDecode(gray)
    if data:
        print(f"[QR] Method 2 (Grayscale) success", file=sys.stderr)
        return data

    # Method 3: Try QRCodeDetectorAruco if available (OpenCV 4.8+)
    try:
        aruco_detector = cv2.QRCodeDetectorAruco()
        data, bbox, _ = aruco_detector.detectAndDecode(img)
        if data:
            print(f"[QR] Method 3 (Aruco) success", file=sys.stderr)
            return data
    except AttributeError:
        pass  # Not available in this OpenCV version

    # Method 4: Crop top-right corner (QR location for this answer sheet)
    height, width = img.shape[:2]
    corner_size = min(height, width) // 3
    top_right = img[:corner_size, width-corner_size:]
    data, bbox, _ = detector.detectAndDecode(top_right)
    if data:
        print(f"[QR] Method 4 (Corner-top-right) success", file=sys.stderr)
        return data

    # Method 5: Downscale large images
    if width > 2000 or height > 2000:
        scale = 1500 / max(width, height)
        small = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        data, bbox, _ = detector.detectAndDecode(small)
        if data:
            print(f"[QR] Method 5 (Downscaled) success", file=sys.stderr)
            return data

    print(f"[QR] All methods failed", file=sys.stderr)
    return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 qr_reader.py <image_path>")
        sys.exit(1)

    image_path = sys.argv[1]
    result = read_qr(image_path)

    if result:
        print(result)
    else:
        sys.exit(1)
