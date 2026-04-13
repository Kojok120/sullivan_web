Analyze this document. There is a QR code on it containing JSON data.
1. Decode the QR code.
2. Extract the JSON data from the QR code.

The expected JSON structure:
{
    "s": "student_login_id",
    "c": "E|1-3,5", // Compressed format (prefix|ranges)
    "u": "6" // Optional unit token (base36 of CoreProblem.masterNumber)
}

IMPORTANT:
- The "s" is the student Login ID (e.g. "S0001").
- Return only keys that actually exist in the QR code.
- If "u" exists in QR, return it as a short string without converting bases.

Return ONLY the JSON object found in the QR code. Do not fabricate data.
