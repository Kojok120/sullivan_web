
import cv2
import sys
import json
import os

def read_qr(image_path):
    if not os.path.exists(image_path):
        return None

    img = cv2.imread(image_path)
    if img is None:
        return None

    # Method 1: Standard QRCodeDetector
    detector = cv2.QRCodeDetector()
    data, bbox, straight_qrcode = detector.detectAndDecode(img)

    if data:
        return data
    
    return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 qr_reader.py <image_path>")
        sys.exit(1)

    image_path = sys.argv[1]
    result = read_qr(image_path)

    if result:
        # Output as JSON to capture safely
        try:
             # Try to parse as JSON if it looks like it
             # But our QR data is just a string which happens to be JSON.
             print(result) 
        except:
             print(result)
    else:
        # Print nothing or specific code
        sys.exit(1)
