import os
import shutil
import base64
import io
from pathlib import Path
from dotenv import load_dotenv

import fitz
import pytesseract
from PIL import Image

load_dotenv()


def get_tesseract_cmd() -> str | None:
    env_cmd = os.getenv("TESSERACT_CMD")
    if env_cmd and Path(env_cmd).is_file():
        return env_cmd

    which_cmd = shutil.which("tesseract")
    if which_cmd and Path(which_cmd).is_file():
        return which_cmd

    candidates = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        "/usr/bin/tesseract",
        "/usr/local/bin/tesseract",
        "/opt/homebrew/bin/tesseract",
        "/usr/bin/tesseract-ocr",
    ]
    for candidate in candidates:
        if Path(candidate).is_file():
            return candidate

    return None


def is_tesseract_available() -> bool:
    cmd = get_tesseract_cmd()
    if cmd:
        pytesseract.pytesseract.tesseract_cmd = cmd
        return True
    return False


_tesseract_path = get_tesseract_cmd()
if _tesseract_path:
    pytesseract.pytesseract.tesseract_cmd = _tesseract_path


def _ocr_with_vision(image: Image.Image) -> str:
    try:
        from health_agent import get_client

        vision_model = (os.getenv("GROQ_VISION_MODEL") or "").strip()
        if not vision_model or "llama-3.2" in vision_model or "preview" in vision_model:
            vision_model = "qwen/qwen3.8-27b"

        img_copy = image.copy().convert("RGB")
        img_copy.thumbnail((1600, 1600))
        output = io.BytesIO()
        img_copy.save(output, format="JPEG", quality=85)
        encoded = base64.b64encode(output.getvalue()).decode("ascii")
        data_url = f"data:image/jpeg;base64,{encoded}"

        client = get_client()
        response = client.chat.completions.create(
            model=vision_model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Extract all readable text, test names, values, units, and ranges from this medical document image. "
                                "Return only the extracted text verbatim without additional conversation."
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url},
                        },
                    ],
                }
            ],
            temperature=0.1,
            max_completion_tokens=1500,
        )
        return (response.choices[0].message.content or "").strip()
    except Exception as exc:
        print(f"Vision OCR fallback failed: {exc}")
        return ""


def extract_pdf_text_from_bytes(data: bytes) -> str:
    pages_text = []

    with fitz.open(stream=data, filetype="pdf") as pdf:
        for page_idx, page in enumerate(pdf, start=1):
            text = page.get_text("text").strip()

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

                # Try Tesseract if available
                if is_tesseract_available():
                    try:
                        text = pytesseract.image_to_string(
                            image,
                            lang="eng",
                        ).strip()
                    except Exception as ocr_err:
                        print(f"Tesseract failed on page {page_idx}: {ocr_err}")

                # Fallback to Vision OCR if Tesseract failed or unavailable
                if not text:
                    text = _ocr_with_vision(image)

            if text:
                pages_text.append(text)

    return "\n\n".join(pages_text)
