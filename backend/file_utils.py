import os
import shutil
import pytesseract
import base64
import io
import pymupdf
from pathlib import Path

import fitz
from PIL import Image

if os.name == "nt":
    pytesseract.pytesseract.tesseract_cmd = (
        r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    )
else:
    pytesseract.pytesseract.tesseract_cmd = (
        shutil.which("tesseract") or "/usr/bin/tesseract"
    )

MAX_FILE_SIZE = 10 * 1024 * 1024
MAX_REPORT_CHARS = 6000

ALLOWED_REPORT_EXTENSIONS = {".pdf", ".txt", ".md"}
ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def validate_size(data: bytes):
    if not data:
        raise ValueError("The uploaded file is empty.")

    if len(data) > MAX_FILE_SIZE:
        raise ValueError("Maximum upload size is 10 MB.")


def _ocr_pil_image(image: Image.Image) -> str:
    """Run Tesseract OCR on a PIL image, with a useful setup error."""
    if not shutil.which("tesseract") and not Path(pytesseract.pytesseract.tesseract_cmd).exists():
        raise ValueError(
            "Tesseract OCR is not installed or cannot be found. "
            "Install the Tesseract engine on this machine/server."
        )
    try:
        image = image.convert("RGB")
        return pytesseract.image_to_string(image, config="--psm 6").strip()
    except Exception as exc:
        raise ValueError(
            "OCR could not read this page. Check that Tesseract OCR is installed."
        ) from exc


def extract_image_text(filename: str, data: bytes) -> str:
    """Extract readable text from an uploaded image using OCR."""
    validate_size(data)
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValueError("Upload PNG, JPG, JPEG, or WebP images.")
    try:
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            if image.width * image.height > 20_000_000:
                raise ValueError("Image dimensions are too large.")
            text = _ocr_pil_image(image)
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("The uploaded image could not be read.") from exc
    if not text:
        raise ValueError("OCR did not find readable text in this image.")
    return text[:MAX_REPORT_CHARS]


def extract_report_text(filename: str, data: bytes) -> str:
    validate_size(data)
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_REPORT_EXTENSIONS:
        raise ValueError("Upload a PDF, TXT, or Markdown report.")

    if extension != ".pdf":
        text = data.decode("utf-8-sig", errors="replace").strip()
        if not text:
            raise ValueError("No readable text was found.")
        return text[:MAX_REPORT_CHARS]

    document = None
    try:
        document = pymupdf.open(stream=data, filetype="pdf")
        if document.needs_pass:
            raise ValueError("Password-protected PDFs are not supported.")

        parts = []
        for page_number, page in enumerate(document, start=1):
            text = page.get_text("text").strip()
            # OCR pages with no/very little embedded text (common in scans).
            if len(text) < 30:
                pixmap = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False)
                page_image = Image.open(io.BytesIO(pixmap.tobytes("png")))
                ocr_text = _ocr_pil_image(page_image)
                if ocr_text:
                    text = ocr_text
                elif not text:
                    text = "[OCR could not find readable text on this page.]"
            parts.append(f"--- Page {page_number} ---\n{text}")

        result = "\n\n".join(parts).strip()
        if not result or all("[OCR could not find readable text" in part for part in parts):
            raise ValueError("No readable text was found in this PDF, even after OCR.")
        return result[:MAX_REPORT_CHARS]
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("Could not read this PDF. Check that it is valid and that OCR is installed for scanned pages.") from exc
    finally:
        if document is not None:
            document.close()


def image_to_data_url(filename: str, data: bytes) -> str:
    validate_size(data)
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValueError(
            "Upload PNG, JPG, JPEG, or WebP images."
        )

    try:
        # Verify that the uploaded file is a valid image.
        with Image.open(io.BytesIO(data)) as image:
            image.verify()

        # Reopen the image after verification.
        with Image.open(io.BytesIO(data)) as image:
            image.load()

            if image.width * image.height > 20_000_000:
                raise ValueError(
                    "Image dimensions are too large."
                )

            image = image.convert("RGB")
            image.thumbnail((1600, 1600))

            output = io.BytesIO()
            image.save(
                output,
                format="JPEG",
                quality=85,
            )

            encoded = base64.b64encode(
                output.getvalue()
            ).decode("ascii")

            return "data:image/jpeg;base64," + encoded

    except ValueError:
        raise

    except Exception as exc:
        raise ValueError(
            "The uploaded image could not be read."
        ) from exc
def limit_extracted_text(text: str, max_chars: int = 6000) -> str:
    """Limit extracted text before adding it to an AI prompt."""
    text = (text or "").strip()

    if len(text) <= max_chars:
        return text

    return (
        text[:max_chars]
        + "\n\n[Remaining text omitted to fit the AI request.]"
    )