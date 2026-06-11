from __future__ import annotations

import mimetypes
import re
from abc import ABC, abstractmethod

from app.ai.models import ContentType, ParsedDocument, UploadedAsset
from app.ai.moderation import ModerationLayer


class DocumentParser(ABC):
    @abstractmethod
    def parse(self, upload: UploadedAsset) -> ParsedDocument:
        raise NotImplementedError


def _decode_text(content: bytes) -> str:
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace")


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


class TextDocumentParser(DocumentParser):
    def __init__(self, moderation: ModerationLayer) -> None:
        self.moderation = moderation

    def parse(self, upload: UploadedAsset) -> ParsedDocument:
        text = _normalize_text(_decode_text(upload.content))
        return ParsedDocument(
            upload_id=upload.upload_id,
            twin_id=upload.twin_id,
            content_type=ContentType.TEXT,
            text=text,
            sensitivity=self.moderation.classify_sensitivity(text),
            metadata={"filename": upload.filename, "mime_type": upload.mime_type},
        )


class PdfParser(DocumentParser):
    def __init__(self, moderation: ModerationLayer) -> None:
        self.moderation = moderation

    def parse(self, upload: UploadedAsset) -> ParsedDocument:
        warnings: list[str] = []
        text = ""
        try:
            from pypdf import PdfReader  # type: ignore
            from io import BytesIO

            reader = PdfReader(BytesIO(upload.content))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as exc:
            warnings.append(f"pypdf_unavailable_or_failed:{type(exc).__name__}")
            text = _decode_text(upload.content)

        text = _normalize_text(text)
        return ParsedDocument(
            upload_id=upload.upload_id,
            twin_id=upload.twin_id,
            content_type=ContentType.PDF,
            text=text,
            sensitivity=self.moderation.classify_sensitivity(text),
            metadata={"filename": upload.filename, "mime_type": upload.mime_type},
            warnings=warnings,
        )


class ImageOcrParser(DocumentParser):
    def __init__(self, moderation: ModerationLayer) -> None:
        self.moderation = moderation

    def parse(self, upload: UploadedAsset) -> ParsedDocument:
        warnings: list[str] = []
        text = ""
        try:
            from io import BytesIO

            import pytesseract  # type: ignore
            from PIL import Image  # type: ignore

            text = pytesseract.image_to_string(Image.open(BytesIO(upload.content)))
        except Exception as exc:
            warnings.append(f"ocr_provider_unavailable:{type(exc).__name__}")
            text = f"Image upload {upload.filename} stored for OCR processing."

        text = _normalize_text(text)
        return ParsedDocument(
            upload_id=upload.upload_id,
            twin_id=upload.twin_id,
            content_type=ContentType.IMAGE,
            text=text,
            sensitivity=self.moderation.classify_sensitivity(text),
            metadata={"filename": upload.filename, "mime_type": upload.mime_type, "ocr": True},
            warnings=warnings,
        )


class AudioTranscriptionParser(DocumentParser):
    def __init__(self, moderation: ModerationLayer) -> None:
        self.moderation = moderation

    def parse(self, upload: UploadedAsset) -> ParsedDocument:
        text = f"Audio upload {upload.filename} queued for transcription."
        return ParsedDocument(
            upload_id=upload.upload_id,
            twin_id=upload.twin_id,
            content_type=ContentType.AUDIO,
            text=text,
            sensitivity=self.moderation.classify_sensitivity(text),
            metadata={
                "filename": upload.filename,
                "mime_type": upload.mime_type,
                "transcription_provider": "pending",
            },
            warnings=["external_transcription_provider_not_configured"],
        )


class VideoAnalysisParser(DocumentParser):
    def __init__(self, moderation: ModerationLayer) -> None:
        self.moderation = moderation

    def parse(self, upload: UploadedAsset) -> ParsedDocument:
        text = f"Video upload {upload.filename} queued for video analysis and transcription."
        return ParsedDocument(
            upload_id=upload.upload_id,
            twin_id=upload.twin_id,
            content_type=ContentType.VIDEO,
            text=text,
            sensitivity=self.moderation.classify_sensitivity(text),
            metadata={
                "filename": upload.filename,
                "mime_type": upload.mime_type,
                "video_analysis_provider": "pending",
            },
            warnings=["external_video_analysis_provider_not_configured"],
        )


class ParserRegistry:
    def __init__(self, moderation: ModerationLayer) -> None:
        self.text = TextDocumentParser(moderation)
        self.pdf = PdfParser(moderation)
        self.image = ImageOcrParser(moderation)
        self.audio = AudioTranscriptionParser(moderation)
        self.video = VideoAnalysisParser(moderation)

    def parser_for(self, upload: UploadedAsset) -> DocumentParser:
        mime_type = upload.mime_type or mimetypes.guess_type(upload.filename)[0] or ""
        if mime_type == "application/pdf" or upload.filename.lower().endswith(".pdf"):
            return self.pdf
        if mime_type.startswith("image/"):
            return self.image
        if mime_type.startswith("audio/"):
            return self.audio
        if mime_type.startswith("video/"):
            return self.video
        return self.text

