
import os
import fitz
import pytesseract
from PIL import Image


# Use the Windows executable locally.
# On Render/Linux, Tesseract should be available through PATH.
if os.name == "nt":
    pytesseract.pytesseract.tesseract_cmd = (
        r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    )


def extract_pdf_text_from_bytes(data: bytes) -> str:
    pages_text = []

    with fitz.open(stream=data, filetype="pdf") as pdf:
        for page in pdf:
            # OCR each PDF page as an image
            pix = page.get_pixmap(
                matrix=fitz.Matrix(2, 2),
                alpha=False,
            )

            image = Image.frombytes(
                "RGB",
                [pix.width, pix.height],
                pix.samples,
            )

            text = pytesseract.image_to_string(
                image,
                lang="eng",
            ).strip()

            if text:
                pages_text.append(text)

    return "\n\n".join(pages_text)
