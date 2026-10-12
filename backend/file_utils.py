import os
import pytesseract
pytesseract.pytesseract.tesseract_cmd =(
   
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)
import base64
import io
from pathlib import Path
import fitz
from PIL import Image
from pypdf import PdfReader


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

    if extension != ".pdf":
        text = data.decode("utf-8-sig", errors="replace").strip()
        if not text:
            raise ValueError("No readable text was found.")
        return text[:MAX_REPORT_CHARS]

    try:
        document = fitz.open(
            stream=data,
            filetype="pdf",
        )

        if document.needs_pass:
            document.close()
            raise ValueError(
                "Password-protected PDFs are not supported."
            )

        parts = []

        for page_number, page in enumerate(document, start=1):
            text = page.get_text("text").strip()

            # Use OCR if the page has little embedded text.
            if len(text) < 40:
                pix = page.get_pixmap(
                    matrix=fitz.Matrix(2, 2),
                    alpha=False,
                )

                image = Image.open(
                    io.BytesIO(pix.tobytes("png"))
                )

                ocr_text = pytesseract.image_to_string(
                    image,
                    config="--oem 3 --psm 3",
                ).strip()

                # Keep whichever extraction produced more text.
                if len(ocr_text) > len(text):
                    text = ocr_text

            parts.append(
                f"--- Page {page_number} ---\n{text}"
            )

        document.close()
        result = "\n\n".join(parts).strip()

        if not result:
            raise ValueError(
                "No readable text was found in this PDF."
            )

        return result[:MAX_REPORT_CHARS]

    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(
            "Could not read the PDF. Check that it is valid "
            "and that Tesseract OCR is installed."
        ) from exc

def image_to_data_url(filename: str, data: bytes) -> str:
    validate_size(data)
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValueError("Upload PNG, JPG, JPEG, or WebP images.")

    try:
        with Image.open(io.BytesIO(data)) as image:
            image.verify()

        with Image.open(io.BytesIO(data)) as image:
            image.load()

            if image.width * image.height > 20_000_000:
                raise ValueError("Image dimensions are too large.")

            image = image.convert("RGB")
            image.thumbnail((1600, 1600))

            output = io.BytesIO()
            image.save(output, format="JPEG", quality=85)
            encoded = base64.b64encode(
                output.getvalue()
            ).decode("ascii")

            return "data:image/jpeg;base64," + encoded

    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("The uploaded image could not be read.") from exc
