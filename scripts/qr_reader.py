
import sys
import os

# Try to import pyzbar first (more reliable), fall back to OpenCV
try:
    from pyzbar.pyzbar import decode
    from PIL import Image, ImageOps
    PYZBAR_AVAILABLE = True
except ImportError:
    PYZBAR_AVAILABLE = False

import cv2

print(f"[QR] Python version: {sys.version}", file=sys.stderr)
print(f"[QR] OpenCV version: {cv2.__version__}", file=sys.stderr)
print(f"[QR] Pyzbar available: {PYZBAR_AVAILABLE}", file=sys.stderr)

def pyzbar_decode(pil_img, label):
    results = decode(pil_img)
    if results:
        data = results[0].data.decode('utf-8')
        print(f"[QR] Method 0 (Pyzbar {label}) success", file=sys.stderr)
        return data
    return None

def pil_corner_crops(pil_img, size):
    width, height = pil_img.size
    return [
        ("top-left", pil_img.crop((0, 0, size, size))),
        ("top-right", pil_img.crop((width - size, 0, width, size))),
        ("bottom-left", pil_img.crop((0, height - size, size, height))),
        ("bottom-right", pil_img.crop((width - size, height - size, width, height))),
    ]

def opencv_decode(detector, img, label):
    data, bbox, _ = detector.detectAndDecode(img)
    if data:
        print(f"[QR] Method 1 (OpenCV {label}) success", file=sys.stderr)
        return data
    if hasattr(detector, "detectAndDecodeMulti"):
        try:
            ok, decoded, _, _ = detector.detectAndDecodeMulti(img)
            if ok:
                for item in decoded:
                    if item:
                        print(f"[QR] Method 1 (OpenCV {label} multi) success", file=sys.stderr)
                        return item
        except Exception:
            pass
    return None

def cv_corner_crops(img, size):
    height, width = img.shape[:2]
    return [
        ("top-left", img[:size, :size]),
        ("top-right", img[:size, width - size:]),
        ("bottom-left", img[height - size:, :size]),
        ("bottom-right", img[height - size:, width - size:]),
    ]

def read_qr(image_path):
    if not os.path.exists(image_path):
        print(f"[QR] File not found: {image_path}", file=sys.stderr)
        return None

    # ===== Method 0: PYZBAR (Most Reliable) =====
    if PYZBAR_AVAILABLE:
        try:
            img = Image.open(image_path)
            data = pyzbar_decode(img, "original")
            if data:
                return data

            gray = ImageOps.autocontrast(img.convert('L'))
            data = pyzbar_decode(gray, "grayscale")
            if data:
                return data

            for angle in (90, 180, 270):
                rotated = img.rotate(angle, expand=True)
                data = pyzbar_decode(rotated, f"rotate-{angle}")
                if data:
                    return data

            width, height = img.size
            for fraction in (0.5, 0.33):
                size = int(min(width, height) * fraction)
                if size <= 0:
                    continue
                for label, crop in pil_corner_crops(img, size):
                    data = pyzbar_decode(crop, f"corner-{label}-{size}")
                    if data:
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
    data = opencv_decode(detector, img, "original")
    if data:
        return data

    # Method 2: Try on grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    data = opencv_decode(detector, gray, "grayscale")
    if data:
        return data

    # Method 2b: Try on thresholded images
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    data = opencv_decode(detector, otsu, "otsu")
    if data:
        return data

    adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 31, 2)
    data = opencv_decode(detector, adaptive, "adaptive")
    if data:
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

    # Method 4: Crop corners (QR location can vary or rotation may occur)
    height, width = img.shape[:2]
    for fraction in (0.5, 0.33):
        corner_size = int(min(height, width) * fraction)
        if corner_size <= 0:
            continue
        for label, crop in cv_corner_crops(img, corner_size):
            data = opencv_decode(detector, crop, f"corner-{label}-{corner_size}")
            if data:
                return data

    # Method 5: Try rotated images
    for angle, rotate_code in ((90, cv2.ROTATE_90_CLOCKWISE), (180, cv2.ROTATE_180), (270, cv2.ROTATE_90_COUNTERCLOCKWISE)):
        rotated = cv2.rotate(img, rotate_code)
        data = opencv_decode(detector, rotated, f"rotate-{angle}")
        if data:
            return data

    # Method 6: Downscale large images
    if width > 2000 or height > 2000:
        scale = 1500 / max(width, height)
        small = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        data = opencv_decode(detector, small, "downscaled")
        if data:
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
