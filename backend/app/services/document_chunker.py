"""Document Chunking Module for ForgeLocal.

Splits extracted document content into overlapping, manageable chunks aligned with
paragraphs, lines, and structural boundaries while preserving source page/section locations.
"""

from dataclasses import dataclass
import re
from typing import List, Optional
from app.services.document_extractors import ExtractedPage


@dataclass
class DocumentChunk:
    chunk_index: int
    page_number: Optional[int]
    section_heading: Optional[str]
    content: str
    char_count: int


def chunk_extracted_pages(
    pages: List[ExtractedPage],
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> List[DocumentChunk]:
    """Chunks a list of extracted pages/sections preserving metadata citations.
    
    Ensures that chunks respect paragraph or line breaks wherever possible
    and carry explicit page numbers and section headings for precise citations.
    """
    chunks: List[DocumentChunk] = []
    chunk_index = 0

    for page in pages:
        if page.is_empty or not page.content.strip():
            continue

        text = page.content.strip()
        page_num = page.page_number
        heading = page.section_heading

        # If text is small enough, keep as single chunk
        if len(text) <= chunk_size:
            chunks.append(
                DocumentChunk(
                    chunk_index=chunk_index,
                    page_number=page_num,
                    section_heading=heading,
                    content=text,
                    char_count=len(text),
                )
            )
            chunk_index += 1
            continue

        # Split along paragraph or sentence boundaries
        paragraphs = re.split(r"(\n\s*\n)", text)
        current_chunk_parts: List[str] = []
        current_len = 0

        for part in paragraphs:
            part_len = len(part)

            if current_len + part_len <= chunk_size:
                current_chunk_parts.append(part)
                current_len += part_len
            else:
                # Flush current chunk if it has content
                if current_chunk_parts:
                    chunk_body = "".join(current_chunk_parts).strip()
                    if chunk_body:
                        chunks.append(
                            DocumentChunk(
                                chunk_index=chunk_index,
                                page_number=page_num,
                                section_heading=heading,
                                content=chunk_body,
                                char_count=len(chunk_body),
                            )
                        )
                        chunk_index += 1

                    # Retain overlap from end of current chunk
                    overlap_text = chunk_body[-chunk_overlap:] if len(chunk_body) > chunk_overlap else ""
                    current_chunk_parts = [overlap_text, part] if overlap_text else [part]
                    current_len = sum(len(p) for p in current_chunk_parts)
                else:
                    # Single paragraph is longer than chunk_size: split by lines or characters
                    sub_start = 0
                    while sub_start < part_len:
                        sub_end = min(sub_start + chunk_size, part_len)
                        sub_str = part[sub_start:sub_end].strip()
                        if sub_str:
                            chunks.append(
                                DocumentChunk(
                                    chunk_index=chunk_index,
                                    page_number=page_num,
                                    section_heading=heading,
                                    content=sub_str,
                                    char_count=len(sub_str),
                                )
                            )
                            chunk_index += 1
                        sub_start += (chunk_size - chunk_overlap)
                    current_chunk_parts = []
                    current_len = 0

        # Flush any remaining text in page
        if current_chunk_parts:
            remaining_text = "".join(current_chunk_parts).strip()
            if remaining_text:
                chunks.append(
                    DocumentChunk(
                        chunk_index=chunk_index,
                        page_number=page_num,
                        section_heading=heading,
                        content=remaining_text,
                        char_count=len(remaining_text),
                    )
                )
                chunk_index += 1

    return chunks
