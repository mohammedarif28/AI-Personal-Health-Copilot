
import os
import fitz
import pytesseract
from PIL import Image


# Configure Tesseract for local Windows development.
if os.name == "nt":
    pytesseract.pytesseract.tesseract_cmd = (
        r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    )


def extract_pdf_text_from_bytes(data: bytes) -> str:
    pages_text = []

    with fitz.open(stream=data, filetype="pdf") as pdf:
        for page in pdf:
            # First, extract text already embedded in the PDF.
            text = page.get_text("text").strip()

            # Use OCR only when the page has no embedded text.
            if not text:
                pix = page.get_pixmap(
                    matrix=fitz.Matrix(2, 2),
                    alpha=False,
                )

                image = Image.frombytes(
                    "RGB",
                    [pix.width, pix.height],
                    pix.samples,
                )

                try:
                    text = pytesseract.image_to_string(
                        image,
                        lang="eng",
                    ).strip()
                except Exception as exc:
                    raise RuntimeError(
                        "This PDF appears to require OCR, but the "
                        "OCR engine is unavailable. Please use a "
                        "text-based PDF or configure a hosted OCR service."
                    ) from exc

            if text:
                pages_text.append(text)

    return "\n\n".join(pages_text)
