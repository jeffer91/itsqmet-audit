"""Read-only PDF signature validation; never treats untrusted certificates as verified."""
import json
import sys
from datetime import datetime

def iso(value):
    return value.isoformat() if isinstance(value, datetime) else (str(value) if value else None)

def run(filename):
    try:
        from pyhanko.pdf_utils.reader import PdfFileReader
        from pyhanko.sign.validation import validate_pdf_signature
        from pyhanko_certvalidator import ValidationContext
    except ImportError:
        return {"status": "unverifiable", "reason": "Dependencia pyHanko no instalada"}
    try:
        with open(filename, "rb") as stream:
            reader = PdfFileReader(stream)
            signatures = []
            for sig in reader.embedded_regular_signatures:
                item = {"field": sig.field_name, "signingTime": iso(sig.self_reported_timestamp)}
                try:
                    status = validate_pdf_signature(sig, signer_validation_context=ValidationContext(allow_fetching=False))
                    item.update({
                        "integrity": status.intact,
                        "cryptographicValid": status.valid,
                        "trusted": status.trusted,
                        "bottomLine": status.bottom_line,
                        "summary": status.summary(),
                    })
                except Exception as exc:
                    item["error"] = str(exc)
                signatures.append(item)
            if not signatures:
                from cover_review import review
                return {"status": "no-electronic-signature", "signatures": [], "cover": review(filename)}
            if any(s.get("integrity") is False or s.get("cryptographicValid") is False for s in signatures):
                result = "invalid"
            elif all(s.get("bottomLine") is True for s in signatures):
                result = "verified"
            else:
                result = "unverifiable"
            return {"status": result, "signatures": signatures}
    except Exception as exc:
        return {"status": "unverifiable", "reason": str(exc)}

if __name__ == "__main__":
    try:
        print(json.dumps(run(sys.argv[1]), ensure_ascii=True, default=str))
    except Exception as exc:
        print(json.dumps({"status": "unverifiable", "reason": str(exc)}, ensure_ascii=True))
