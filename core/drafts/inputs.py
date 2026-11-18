"""Extract editable evidence without executing workbook formulas."""
from datetime import date, datetime, time
from pathlib import Path
from zipfile import ZipFile


def cell_text(value):
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y" if value.time() == time.min else "%d/%m/%Y %H:%M")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, time):
        return value.strftime("%H:%M")
    return str(value)


def read_input(filename):
    from document import read_reference
    path = Path(filename)
    if path.stat().st_size > 32 * 1024 * 1024:
        raise ValueError("Seleccione un insumo de hasta 32 MB.")
    ext = path.suffix.lower()
    tables = []
    if ext in (".xlsx", ".docx"):
        with ZipFile(path) as archive:
            if sum(item.file_size for item in archive.infolist()) > 64 * 1024 * 1024:
                raise ValueError("El archivo descomprimido supera 64 MB.")
    if ext == ".xlsx":
        from openpyxl import load_workbook
        book = load_workbook(path, read_only=True, data_only=True)
        try:
            for sheet in book.worksheets:
                if sheet.sheet_state != "visible":
                    continue
                sheet.reset_dimensions()
                rows = []
                for row in sheet.values:
                    values = [cell_text(v) for v in row]
                    while values and not values[-1]:
                        values.pop()
                    if values:
                        rows.append(values)
                    if len(values) > 100 or len(rows) > 5000:
                        raise ValueError("Divida la hoja en bloques de hasta 5000 filas y 100 columnas.")
                if rows:
                    tables.append({"label": sheet.title, "rows": rows})
        finally:
            book.close()
        text = ""
    elif ext == ".docx":
        from docx import Document
        doc = Document(path)
        text = read_reference(path)["text"]
        for index, table in enumerate(doc.tables, 1):
            tables.append({"label": f"Tabla {index}", "rows": [[c.text for c in r.cells] for r in table.rows]})
    elif ext == ".txt":
        raw = path.read_bytes()
        if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
            text = raw.decode("utf-16")
        else:
            try:
                text = raw.decode("utf-8-sig")
            except UnicodeDecodeError:
                text = raw.decode("cp1252")
    elif ext == ".pdf":
        text = read_reference(path)["text"]
    else:
        raise ValueError("Seleccione un archivo DOCX, XLSX, TXT o PDF con texto.")
    if not text.strip() and not tables:
        raise ValueError("No se encontraron datos legibles.")
    if len(text) + sum(len(cell) + 1 for t in tables for row in t["rows"] for cell in row) > 350000:
        raise ValueError("Divida el insumo en partes de hasta 350 000 caracteres.")
    return {"name": path.name, "text": text, "tables": tables}
