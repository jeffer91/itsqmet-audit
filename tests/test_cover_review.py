import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import pymupdf as pdf

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "core" / "signatures"))
from validate_pdf import run


class CoverTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / "cover.pdf"

    def fixture(self, scanned=False):
        with pdf.open() as original:
            page = original.new_page(width=520, height=320)
            for x, label in [(20, "Firma obligatoria"), (200, "Aprobado por"), (375, "Firma requerida")]:
                page.draw_rect((x, 60, x+130, 136))
                page.insert_text((x+7, 78), label)
            page.draw_polyline([(214,115),(225,98),(220,119),(239,99),(232,115),(252,111)], width=1.7)
            page.insert_text((384, 109), "Nombre impreso")
            first = page.get_pixmap(matrix=pdf.Matrix(2, 2))
            second = original.new_page(width=520, height=320)
            second.insert_text((100, 100), "Revisado por")
            if scanned:
                with pdf.open() as images:
                    page = images.new_page(width=520, height=320)
                    page.insert_image(page.rect, pixmap=first)
                    images.save(self.path)
            else:
                original.save(self.path)

    def check_slots(self, method):
        result = run(self.path)
        self.assertEqual(result["status"], "no-electronic-signature")
        cover = result["cover"]
        self.assertEqual(cover["method"], method)
        slots = {s["label"]: s for s in cover["slots"]}
        self.assertEqual(slots["firma obligatoria"]["status"], "empty")
        self.assertTrue(slots["firma obligatoria"]["required"])
        self.assertEqual(slots["aprobado por"]["status"], "possible")
        self.assertFalse(slots["aprobado por"]["required"])
        self.assertEqual(slots["firma requerida"]["status"], "review")
        self.assertEqual(len(slots), 3)
        self.assertTrue(all(s.get("preview") for s in slots.values()))

    def test_native_boxes(self):
        self.fixture()
        self.check_slots("pdf")

    def test_scanned_boxes(self):
        executable = os.environ.get("AUDIT_TESSERACT", "tesseract")
        if not shutil.which(executable) or "spa" not in subprocess.check_output(
                [executable, "--list-langs"], text=True).splitlines():
            self.skipTest("Se requiere Tesseract con spa")
        self.fixture(scanned=True)
        self.check_slots("ocr")

    def test_missing_ocr_is_retryable(self):
        self.fixture(scanned=True)
        with patch.dict(os.environ, AUDIT_TESSERACT="audit-missing-tesseract"):
            cover = run(self.path)["cover"]
        self.assertTrue(cover["retry"])
        self.assertEqual(cover["status"], "review")

    def test_unreadable_pdf_never_runs_visual(self):
        self.path.write_bytes(b"bad PDF")
        with patch("cover_review.review", side_effect=AssertionError("fallback inesperado")) as visual:
            self.assertEqual(run(self.path)["status"], "unverifiable")
            visual.assert_not_called()

    def test_signed_pdf_never_uses_cover_even_if_invalid_or_untrusted(self):
        from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
        from pyhanko.sign import signers
        self.fixture()
        key = self.path.with_suffix(".key")
        certificate = self.path.with_suffix(".pem")
        subprocess.run(["openssl", "req", "-newkey", "rsa:2048", "-nodes", "-x509",
                        "-subj", "/CN=Firma prueba", "-days", "1", "-keyout", str(key),
                        "-out", str(certificate)], capture_output=True, check=True)
        signer = signers.SimpleSigner.load(str(key), str(certificate))
        signed = self.path.with_name("signed.pdf")
        with self.path.open("rb") as source, signed.open("wb") as target:
            signers.sign_pdf(IncrementalPdfFileWriter(source),
                             signers.PdfSignatureMetadata(field_name="FirmaDigital"),
                             signer=signer, output=target)
        with patch("cover_review.review") as visual:
            self.assertEqual(run(signed)["status"], "unverifiable")
            data = signed.read_bytes()
            self.assertIn(b"/MediaBox", data)
            signed.write_bytes(data.replace(b"/MediaBox", b"/CropBox ", 1))
            self.assertEqual(run(signed)["status"], "invalid")
            visual.assert_not_called()

    def test_encrypted_pdf_is_unverifiable(self):
        with pdf.open() as document:
            document.new_page()
            document.save(self.path, encryption=pdf.PDF_ENCRYPT_AES_256, owner_pw="owner", user_pw="reader")
        with patch("cover_review.review") as visual:
            self.assertEqual(run(self.path)["status"], "unverifiable")
            visual.assert_not_called()
