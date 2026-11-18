"""Local reference reader and Word draft writer. JSON over UTF-8 stdin/stdout."""
import json
import os
import sys
import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def read_reference(path):
    path = Path(path)
    if path.stat().st_size > 32 * 1024 * 1024:
        raise ValueError("La referencia supera los 32 MB.")
    if path.suffix.lower() == ".pdf":
        import fitz
        with fitz.open(path) as doc:
            if len(doc) > 250:
                raise ValueError("Seleccione una referencia de hasta 250 páginas.")
            text = "\n".join(page.get_text() for page in doc)
    else:
        with ZipFile(path) as archive:
            parts = sorted(n for n in archive.namelist() if n.startswith("word/header") and n.endswith(".xml"))
            parts.append("word/document.xml")
            if sum(archive.getinfo(n).file_size for n in parts) > 12 * 1024 * 1024:
                raise ValueError("El texto de la referencia es demasiado extenso.")
            lines = []
            for part in parts:
                for p in ET.fromstring(archive.read(part)).iter(W + "p"):
                    lines.append("".join(t.text or "" for t in p.iter(W + "t")))
            text = "\n".join(lines)
    if not text.strip():
        raise ValueError("El archivo no contiene texto legible. Use un Word o PDF con texto.")
    if len(text) > 350000:
        raise ValueError("La referencia supera los 350 000 caracteres.")
    return {"name": path.name, "text": text}


def write_draft(data, path):
    from docx import Document
    from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Cm, Pt

    doc = Document()
    section = doc.sections[0]
    section.page_width, section.page_height = Cm(21), Cm(29.7)
    section.top_margin = section.bottom_margin = section.left_margin = section.right_margin = Cm(1.5)
    normal = doc.styles["Normal"]
    normal.font.name, normal.font.size = "Arial", Pt(10)
    normal.paragraph_format.space_after = Pt(0)
    normal.paragraph_format.line_spacing = 1
    kind, title, period = data["kind"], data["title"], data["period"]
    units = {"UTET": "Unidad de Titulación y Eficiencia Terminal", "UGPA": "Unidad de Gestión de Procesos Académicos"}
    unit = units.get(data["scope"], data["scope"])
    values = data.get("values", {})

    def table(widths, heights):
        t = doc.add_table(rows=len(heights), cols=len(widths))
        t.style, t.autofit = "Table Grid", False
        for col, width in zip(t.columns, widths):
            col.width = Cm(width)
            for cell in col.cells:
                cell.width = Cm(width)
                cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
                cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        for row, height in zip(t.rows, heights):
            row.height = Cm(height)
        return t

    def line(cell, value, size=9, bold=False):
        r = cell.paragraphs[0].add_run(value)
        r.bold, r.font.size = bold, Pt(size)

    if kind in ("RGI", "INF", "ACT"):
        rgi = kind == "RGI"
        widths = [4.5, 9, 4.5] if rgi else ([5.2, 7.6, 5.2] if kind == "ACT" else [4.8, 9.5, 3.7])
        head = table(widths, [0.8, 2] if rgi else [1.25, 0.75, 1.2])
        logo = head.cell(0, 0).merge(head.cell(1, 0))
        logo.paragraphs[0].add_run().add_picture(str(Path(__file__).with_name("logo.png")), width=Cm(3.25))
        code = "Código: " + (values.get("Código") or "[pendiente]")
        if rgi:
            line(head.cell(0, 1), unit)
            line(head.cell(1, 1), title + "\n" + period, bold=True)
            line(head.cell(0, 2).merge(head.cell(1, 2)), code)
        else:
            line(head.cell(0, 1).merge(head.cell(1, 1)), unit)
            line(head.cell(0, 2), code)
            line(head.cell(1, 2), "Versión: " + (values.get("Versión") or "[pendiente]"))
            line(head.cell(2, 0), ("Fecha de reunión: " if kind == "ACT" else "Fecha de elaboración: ") + (values.get("Fecha") or "[pendiente]"))
            line(head.cell(2, 1), title, bold=True)
            page = head.cell(2, 2).paragraphs[0]
            for label, field in [("Página ", "PAGE"), (" de ", "NUMPAGES")]:
                page.add_run(label)
                element = OxmlElement("w:fldSimple")
                element.set(qn("w:instr"), field)
                page._p.append(element)
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Cm(5)
        run = p.add_run(title)
        run.bold, run.font.size = True, Pt(23 if kind == "ACT" else 18)
        p = doc.add_paragraph(period + "\nBORRADOR")
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Cm(4.5)
        signatures = table([6, 6, 6], [2.4, .75, 1.05])
        names = ["Mgs. Jefferson Villarreal", "Ing. Martha Tomalá", "Dr. Alex León"]
        roles = ["Gestor de Procesos Académicos" if data["scope"] == "UGPA" else "Coordinador de Titulación y Eficiencia Terminal", "Coordinadora General de Carreras", "Vicerrector"]
        for col, label in enumerate(["Elaborado por", "Revisado por", "Aprobado por"]):
            line(signatures.cell(0, col), label.upper(), bold=True)
            for row, prefix, value in [(1, "Nombre", names[col]), (2, "Cargo", roles[col])]:
                cell = signatures.cell(row, col)
                cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.LEFT
                line(cell, prefix.upper() + ": ", bold=True)
                line(cell, "[pendiente]" if kind == "ACT" else value)
        doc.add_page_break()
    doc.add_paragraph(title).runs[0].bold = True
    doc.add_paragraph(f"Borrador · {unit} · {period}")
    for item in data["sections"]:
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(12)
        p.add_run(item["label"]).bold = True
        doc.add_paragraph(item["text"] or "[Pendiente de completar]")
    for source_table in data.get("tables", []):
        doc.add_paragraph(source_table["label"]).runs[0].bold = True
        rows = source_table["rows"]
        grid = doc.add_table(rows=0, cols=max(map(len, rows)))
        grid.style = "Table Grid"
        for index, row in enumerate(rows):
            cells = grid.add_row().cells
            for cell, value in zip(cells, row):
                run = cell.paragraphs[0].add_run(str(value))
                run.bold = index == 0
    with tempfile.NamedTemporaryFile(dir=Path(path).parent, suffix=".docx", delete=False) as tmp:
        temp = tmp.name
    try:
        doc.save(temp)
        os.replace(temp, path)
    finally:
        Path(temp).unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        data = json.loads(sys.stdin.buffer.read())
        if sys.argv[1] == "input":
            from inputs import read_input
            result = read_input(sys.argv[2])
        elif sys.argv[1] == "read":
            result = read_reference(sys.argv[2])
        else:
            result = write_draft(data, sys.argv[2])
        sys.stdout.buffer.write(json.dumps(result or {}, ensure_ascii=True).encode())
    except ModuleNotFoundError as exc:
        sys.exit("Falta la dependencia Python " + exc.name + ". Instale core/signatures/requirements.txt.")
    except Exception as exc:
        sys.exit(str(exc))
