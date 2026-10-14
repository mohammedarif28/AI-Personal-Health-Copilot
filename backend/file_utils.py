import os
import shutil
import pytesseract
import base64
import io
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
MAX_REPORT_CHARS = 20000

ALLOWED_REPORT_EXTENSIONS = {".pdf", ".txt", ".md"}
ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def validate_size(data: bytes):
    if not data:
        raise ValueError("The uploaded file is empty.")

    if len(data) > MAX_FILE_SIZE:
        raise ValueError("Maximum upload size is 10 MB.")


def extract_report_text(filename: str, data: bytes) -> str:
    validate_size(data)
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_REPORT_EXTENSIONS:
        raise ValueError(
            "Upload a PDF, TXT, or Markdown report."
        )

    # Read TXT and Markdown files.
    if extension != ".pdf":
        text = data.decode(
            "utf-8-sig",
            errors="replace",
        ).strip()

        if not text:
            raise ValueError("No readable text was found.")

        return text[:MAX_REPORT_CHARS]

    # Extract embedded text from PDF files without Tesseract.
    document = None

    try:
        document = fitz.open(
            stream=data,
            filetype="pdf",
        )

        if document.needs_pass:
            raise ValueError(
                "Password-protected PDFs are not supported."
            )

        parts = []

        for page_number, page in enumerate(document, start=1):
            text = page.get_text("text").strip()

            if not text:
                text = (
                    "[No embedded text found on this page. "
                    "This page may be scanned and require OCR.]"
                )

            parts.append(
                f"--- Page {page_number} ---\n{text}"
            )

        result = "\n\n".join(parts).strip()

        # Reject PDFs that contain no extractable report text.
        if not result or all(
            "[No embedded text found on this page." in part
            for part in parts
        ):
            raise ValueError(
                "No readable text was found in this PDF. "
                "It may be a scanned document that requires OCR."
            )

        return result[:MAX_REPORT_CHARS]

    except ValueError:
        raise

    except Exception as exc:
        raise ValueError(
            "Could not read the PDF. Check that the file is valid."
        ) from exc

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
