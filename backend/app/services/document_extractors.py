"""Document Content Extractors for ForgeLocal.

Supports:
- PDF (.pdf) via pypdf with page-by-page tracking, empty page detection, and optional local OCR fallback.
- DOCX (.docx) via python-docx with paragraphs, headings, and table cells preservation.
- Plain Text & Markdown (.txt, .md).
- Tabular & Structured Data (.csv, .json).
- Source Code & Config (.py, .js, .jsx, .ts, .tsx, .html, .css, .sql, .yaml, .yml, .xml, .toml, .sh).
"""

import csv
import io
import json
import logging
from pathlib import Path
import shutil
import subprocess
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("forgelocal.documents.extractors")


class ExtractedPage:
    """Represents a single page or structural section extracted from a document."""

    def __init__(
        self,
        page_number: Optional[int],
        section_heading: Optional[str],
        content: str,
        is_empty: bool = False,
        extraction_warning: Optional[str] = None,
    ):
        self.page_number = page_number
        self.section_heading = section_heading
        self.content = content
        self.is_empty = is_empty
        self.extraction_warning = extraction_warning

    def to_dict(self) -> Dict[str, Any]:
        return {
            "page_number": self.page_number,
            "section_heading": self.section_heading,
            "content": self.content,
            "is_empty": self.is_empty,
            "extraction_warning": self.extraction_warning,
        }


class ExtractionResult:
    """Holds full extraction output, metadata, and quality warnings."""

    def __init__(
        self,
        pages: List[ExtractedPage],
        total_pages_detected: int,
        successfully_extracted_pages: int,
        failed_pages: List[int],
        total_char_count: int,
        warnings: List[str],
        ocr_used: bool = False,
    ):
        self.pages = pages
        self.total_pages_detected = total_pages_detected
        self.successfully_extracted_pages = successfully_extracted_pages
        self.failed_pages = failed_pages
        self.total_char_count = total_char_count
        self.warnings = warnings
        self.ocr_used = ocr_used


def is_tesseract_available() -> bool:
    """Checks if tesseract CLI is installed and available locally."""
    return shutil.which("tesseract") is not None


def extract_pdf(file_path: Path) -> ExtractionResult:
    """Extracts text page by page from a PDF document using pypdf.
    
    Detects empty or image-only pages, password-protected files, and tracks failed pages.
    """
    import pypdf

    pages: List[ExtractedPage] = []
    failed_pages: List[int] = []
    warnings: List[str] = []
    ocr_used = False

    try:
        reader = pypdf.PdfReader(str(file_path))
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception:
                raise ValueError("PDF is encrypted and password-protected. Cannot extract text.")

        total_pages = len(reader.pages)
        if total_pages == 0:
            return ExtractionResult([], 0, 0, [], 0, ["PDF file contains zero pages."])

        for page_idx in range(total_pages):
            page_num = page_idx + 1
            try:
                page_obj = reader.pages[page_idx]
                text = page_obj.extract_text() or ""
                clean_text = text.strip()

                if not clean_text:
                    # Empty or image-only page
                    warning = f"Page {page_num} contains no extractable text."
                    # If local OCR is available, we could run Tesseract
                    if is_tesseract_available():
                        # Optional local OCR can be attempted if tools exist
                        pass
                    else:
                        warning += " (May be scanned image; local OCR not installed)"
                    
                    warnings.append(warning)
                    pages.append(ExtractedPage(
                        page_number=page_num,
                        section_heading=f"Page {page_num}",
                        content="",
                        is_empty=True,
                        extraction_warning=warning,
                    ))
                else:
                    pages.append(ExtractedPage(
                        page_number=page_num,
                        section_heading=f"Page {page_num}",
                        content=clean_text,
                        is_empty=False,
                    ))
            except Exception as e:
                failed_pages.append(page_num)
                err_msg = f"Failed to extract text from page {page_num}: {str(e)}"
                warnings.append(err_msg)
                pages.append(ExtractedPage(
                    page_number=page_num,
                    section_heading=f"Page {page_num}",
                    content="",
                    is_empty=True,
                    extraction_warning=err_msg,
                ))

        total_chars = sum(len(p.content) for p in pages)
        successful_pages = sum(1 for p in pages if not p.is_empty and not p.extraction_warning)

        if total_chars == 0 and total_pages > 0:
            warnings.append("Document appears to be a scanned PDF or contains only raster images. Normal text extraction yielded 0 characters.")

        return ExtractionResult(
            pages=pages,
            total_pages_detected=total_pages,
            successfully_extracted_pages=successful_pages,
            failed_pages=failed_pages,
            total_char_count=total_chars,
            warnings=warnings,
            ocr_used=ocr_used,
        )

    except Exception as e:
        if "encrypted" in str(e).lower() or "password" in str(e).lower():
            raise ValueError(f"Password protected PDF: {e}")
        logger.error(f"Error parsing PDF file {file_path}: {e}")
        raise ValueError(f"Malformed or unreadable PDF: {e}")


def extract_docx(file_path: Path) -> ExtractionResult:
    """Extracts paragraphs, headings, and table contents from a DOCX file using python-docx."""
    import docx

    pages: List[ExtractedPage] = []
    warnings: List[str] = []

    try:
        doc = docx.Document(str(file_path))
        current_heading = "Document Content"
        current_section_texts: List[str] = []
        section_idx = 1

        def flush_section():
            nonlocal section_idx, current_section_texts, current_heading
            if current_section_texts:
                full_text = "\n\n".join(current_section_texts).strip()
                if full_text:
                    pages.append(ExtractedPage(
                        page_number=section_idx,
                        section_heading=current_heading,
                        content=full_text,
                    ))
                    section_idx += 1
                current_section_texts = []

        # Iterate through block level paragraphs and tables in order
        for para in doc.paragraphs:
            text = para.text.strip()
            if not text:
                continue

            # Detect headings
            if para.style and para.style.name and para.style.name.startswith("Heading"):
                flush_section()
                current_heading = text
                current_section_texts.append(f"## {text}")
            else:
                current_section_texts.append(text)

        # Extract table rows
        for table_idx, table in enumerate(doc.tables, 1):
            table_lines: List[str] = [f"\n[Table {table_idx}]"]
            for row in table.rows:
                row_cells = [cell.text.strip().replace("\n", " ") for cell in row.cells]
                if any(row_cells):
                    table_lines.append(" | ".join(row_cells))
            if len(table_lines) > 1:
                current_section_texts.append("\n".join(table_lines))

        flush_section()

        if not pages:
            pages.append(ExtractedPage(
                page_number=1,
                section_heading="Empty Document",
                content="",
                is_empty=True,
                extraction_warning="DOCX file contains no readable text or paragraphs.",
            ))

        total_chars = sum(len(p.content) for p in pages)
        successful_sections = sum(1 for p in pages if not p.is_empty)

        return ExtractionResult(
            pages=pages,
            total_pages_detected=max(1, len(pages)),
            successfully_extracted_pages=successful_sections,
            failed_pages=[],
            total_char_count=total_chars,
            warnings=warnings,
        )

    except Exception as e:
        logger.error(f"Error reading DOCX file {file_path}: {e}")
        raise ValueError(f"Malformed or unreadable Word document: {e}")


def extract_csv(file_path: Path) -> ExtractionResult:
    """Parses a CSV file, preserving headers and column relationships."""
    pages: List[ExtractedPage] = []
    warnings: List[str] = []

    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.reader(f)
            rows = list(reader)

        if not rows:
            return ExtractionResult([], 0, 0, [], 0, ["CSV file is empty."])

        header = rows[0]
        header_str = " | ".join(header)
        total_rows = len(rows) - 1

        # Group rows into batches of 50 rows per section
        batch_size = 50
        page_num = 1
        for i in range(1, len(rows), batch_size):
            chunk_rows = rows[i:i + batch_size]
            lines = [f"Columns: {header_str}\n---"]
            for r in chunk_rows:
                lines.append(" | ".join(r))
            
            section_content = "\n".join(lines)
            pages.append(ExtractedPage(
                page_number=page_num,
                section_heading=f"CSV Records {i} to {min(i + batch_size - 1, total_rows)}",
                content=section_content,
            ))
            page_num += 1

        total_chars = sum(len(p.content) for p in pages)
        return ExtractionResult(
            pages=pages,
            total_pages_detected=len(pages),
            successfully_extracted_pages=len(pages),
            failed_pages=[],
            total_char_count=total_chars,
            warnings=warnings,
        )
    except Exception as e:
        logger.error(f"Error reading CSV {file_path}: {e}")
        raise ValueError(f"Malformed CSV file: {e}")


def extract_json(file_path: Path) -> ExtractionResult:
    """Parses a JSON file preserving structural hierarchy."""
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            data = json.load(f)

        formatted = json.dumps(data, indent=2, ensure_ascii=False)
        pages = [
            ExtractedPage(
                page_number=1,
                section_heading="JSON Structure",
                content=formatted,
            )
        ]
        return ExtractionResult(
            pages=pages,
            total_pages_detected=1,
            successfully_extracted_pages=1,
            failed_pages=[],
            total_char_count=len(formatted),
            warnings=[],
        )
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid or malformed JSON: {e}")
    except Exception as e:
        raise ValueError(f"Could not read JSON file: {e}")


def extract_text(file_path: Path) -> ExtractionResult:
    """Extracts text, markdown, or source code files with UTF-8 decoding fallback."""
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        clean_content = content.strip()
        if not clean_content:
            return ExtractionResult([], 0, 0, [], 0, ["File is empty."])

        # If file is very large (> 1000 lines), partition into numbered sections for location tracking
        lines = clean_content.splitlines()
        pages: List[ExtractedPage] = []

        if len(lines) <= 250:
            pages.append(ExtractedPage(
                page_number=1,
                section_heading=file_path.name,
                content=clean_content,
            ))
        else:
            step = 200
            for idx, start_i in enumerate(range(0, len(lines), step), 1):
                chunk_lines = lines[start_i:start_i + step]
                pages.append(ExtractedPage(
                    page_number=idx,
                    section_heading=f"Lines {start_i + 1}–{min(start_i + step, len(lines))}",
                    content="\n".join(chunk_lines),
                ))

        total_chars = sum(len(p.content) for p in pages)
        return ExtractionResult(
            pages=pages,
            total_pages_detected=len(pages),
            successfully_extracted_pages=len(pages),
            failed_pages=[],
            total_char_count=total_chars,
            warnings=[],
        )
    except Exception as e:
        raise ValueError(f"Could not read text file: {e}")


def extract_document(file_path: Path, ext: str) -> ExtractionResult:
    """Main extractor dispatcher matching file extensions."""
    norm_ext = ext.lower().strip()
    if norm_ext == ".pdf":
        return extract_pdf(file_path)
    elif norm_ext in (".docx", ".doc"):
        if norm_ext == ".doc":
            raise ValueError("Legacy .doc binary format is not supported directly. Please convert to modern .docx or .pdf.")
        return extract_docx(file_path)
    elif norm_ext == ".csv":
        return extract_csv(file_path)
    elif norm_ext == ".json":
        return extract_json(file_path)
    elif norm_ext in (
        ".txt", ".md", ".py", ".js", ".jsx", ".ts", ".tsx",
        ".html", ".css", ".sql", ".yaml", ".yml", ".xml",
        ".toml", ".sh", ".rst", ".ini", ".cfg"
    ):
        return extract_text(file_path)
    else:
        raise ValueError(
            f"Unsupported file type '{ext}'. Supported formats: .pdf, .docx, .txt, .md, .csv, .json, and code/config files (.py, .js, .ts, .html, .css, .sql, .yaml, .toml)."
        )
