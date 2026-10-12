
import base64
import io
from pathlib import Path

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
        raise ValueError("Upload a PDF, TXT, or Markdown report.")

    if extension == ".pdf":
        reader = PdfReader(io.BytesIO(data))

        if reader.is_encrypted:
            raise ValueError("Password-protected PDFs are not supported.")

        parts = []

        for page in reader.pages:
            parts.append(page.extract_text() or "")

        text = "\n".join(parts)

    else:
        text = data.decode("utf-8-sig", errors="replace")

    text = text.strip()

    if not text:
        raise ValueError(
            "No readable text was found. Scanned PDFs may need OCR."
        )

    return text[:MAX_REPORT_CHARS]


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
