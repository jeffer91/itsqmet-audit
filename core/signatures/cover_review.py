"""Local visual triage of signature boxes on PDF page one. Coordinates are raster pixels."""
import base64
import csv
import io
import os
import re
import subprocess
import unicodedata

VERSION = 1
LABEL = re.compile(r"\b(?:firma(?:\s+(?:obligatoria|requerida|del?\s+\w+))?|(?:elaborado|revisado|aprobado)\s+por)\b")


def normalize(text):
    return "".join(c for c in unicodedata.normalize("NFKD", text.lower())
                   if not unicodedata.combining(c))


def ocr_words(image, cv):
    binary = os.environ.get("AUDIT_TESSERACT", "tesseract")
    data = cv.imencode(".png", image)[1].tobytes()
    result = subprocess.run([binary, "stdin", "stdout", "-l", "spa", "--psm", "11", "-c", "tessedit_create_tsv=1"],
                            input=data, capture_output=True, timeout=20, check=True)
    words = []
    for row in csv.DictReader(io.StringIO(result.stdout.decode("utf-8")), delimiter="\t"):
        if row["level"] == "5" and row["text"].strip() and float(row["conf"]) >= 45:
            x, y, w, h = (int(row[k]) for k in ("left", "top", "width", "height"))
            words.append((x, y, x+w, y+h, row["text"]))
    return words


def anchors(words):
    found = []
    for x, y, right, bottom, text in words:
        if not re.match(r"^(?:firma|elaborado|revisado|aprobado)\b", normalize(text)):
            continue
        following = sorted((w for w in words if w[0] >= right-1 and
                            abs((w[1]+w[3]-y-bottom)/2) < (bottom-y)*0.55))
        phrase, end = text, right
        for word in following[:3]:
            if word[0]-end > (bottom-y)*1.7:
                break
            phrase += " " + word[4]
            end = word[2]
            bottom = max(bottom, word[3])
        match = LABEL.match(normalize(phrase))
        if match:
            found.append((x, y, bottom, match.group()))
    return found


def inspect_box(gray, words, anchor, boxes, cv, np):
    x, y, bottom, label = anchor
    slot = {"label": label, "status": "review", "required": label in ("firma obligatoria", "firma requerida")}
    for left, top, width, height in boxes:
        if not (left <= x < left+width and top <= y and bottom < top+height):
            continue
        if height > gray.shape[0]*0.30 or width > gray.shape[1]*0.94:
            continue
        # Only evaluate a well-delimited writing space beside the label vertically.
        if y-top < height*0.45:
            y1, y2 = bottom+4, top+height-5
        else:
            y1, y2 = top+5, y-4
        if y2-y1 < 35 or width < 75:
            continue
        crop = gray[y1:y2, left+5:left+width-5]
        ratio = min(1, 260/crop.shape[1], 140/crop.shape[0])
        preview = cv.resize(crop, (max(1, round(crop.shape[1]*ratio)), max(1, round(crop.shape[0]*ratio))))
        slot["preview"] = base64.b64encode(cv.imencode(".jpg", preview, [cv.IMWRITE_JPEG_QUALITY, 65])[1]).decode()
        ink = cv.threshold(crop, 220, 255, cv.THRESH_BINARY_INV)[1]
        # Remove a printed horizontal signature line before measuring ink.
        rule = cv.morphologyEx(ink, cv.MORPH_OPEN, np.ones((1, max(30, crop.shape[1]//3)), np.uint8))
        ink = cv.subtract(ink, rule)
        if any(left < (w[0]+w[2])/2 < left+width and y1 < (w[1]+w[3])/2 < y2 for w in words):
            return slot
        if not np.any(ink):
            # Faint marks can disappear at the main ink threshold. Keep ambiguous scans for review.
            pale = (crop > 220) & (crop < np.percentile(crop, 95)-5)
            if np.count_nonzero(pale) < 6:
                slot["status"] = "empty"
            return slot
        contours = cv.findContours(ink, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)[0]
        for contour in contours:
            _, _, w, h = cv.boundingRect(contour)
            density = cv.contourArea(contour)/max(1, w*h)
            if w >= 36 and h >= 12 and w >= h*1.3 and 0.02 < density < 0.42:
                slot["status"] = "possible"
                break
        return slot
    return slot


def review(filename):
    result = {"version": VERSION, "page": 1, "status": "review", "slots": []}
    try:
        import cv2 as cv
        import numpy as np
        import pymupdf as pdf
        with pdf.open(filename) as doc:
            page = doc[0]
            scale = min(2.5, 2200 / max(page.rect.width, page.rect.height))
            pix = page.get_pixmap(matrix=pdf.Matrix(scale, scale), colorspace=pdf.csGRAY, alpha=False)
            gray = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
            words = []
            for w in page.get_text("words"):
                rect = pdf.Rect(*w[:4]) * page.rotation_matrix * pdf.Matrix(scale, scale)
                words.append((*map(round, rect), w[4]))
        labels = anchors(words)
        result["method"] = "pdf"
        if not labels:
            result["method"] = "ocr"
            words = ocr_words(gray, cv)
            labels = anchors(words)
        if not labels:
            result["reason"] = "No se identificaron espacios de firma en la portada."
            return result
        ink = cv.threshold(gray, 195, 255, cv.THRESH_BINARY_INV)[1]
        horizontal = cv.morphologyEx(ink, cv.MORPH_OPEN, np.ones((1, 40), np.uint8))
        vertical = cv.morphologyEx(ink, cv.MORPH_OPEN, np.ones((30, 1), np.uint8))
        contours = cv.findContours(cv.bitwise_or(horizontal, vertical), cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)[0]
        boxes = sorted((cv.boundingRect(c) for c in contours), key=lambda box: box[2]*box[3])
        if len(labels) > 12:
            result["reason"] = "La distribución de la portada requiere revisión."
            return result
        result["slots"] = [inspect_box(gray, words, anchor, boxes, cv, np) for anchor in labels]
        result["status"] = "inspected"
    except (FileNotFoundError, subprocess.SubprocessError):
        result.update(retry=True, reason="OCR no disponible. Compruebe Tesseract y el idioma español (spa).")
    except Exception as exc:
        result.update(retry=True, reason="No se pudo examinar la portada: " + str(exc))
    return result
