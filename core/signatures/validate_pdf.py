"""Read-only cryptographic PDF signature inspection. Requires pyhanko >=0.38."""
import json
import sys
from datetime import datetime

def iso(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)

def run(path):
    try:
        from pyhanko.pdf_utils.reader import PdfFileReader
        from pyhanko.sign.validation import validate_pdf_signature
        from pyhanko_certvalidator import ValidationContext
    except ImportError:
        return {"status": "unverifiable", "reason": "Instale pyhanko>=0.38 en el Python local"}
    try:
        with open(path, "rb") as stream:
            reader = PdfFileReader(stream)
            signatures = []
            for sig in reader.embedded_signatures:
                info = {"field": sig.field_name, "signingTime": iso(sig.self_reported_timestamp)}
                try:
                    status = validate_pdf_signature(sig, signer_validation_context=ValidationContext(allow_fetching=False))
                    info.update({
                        "integrity": bool(status.intact),
                        "cryptographicValid": bool(status.valid),
                        "trusted": bool(status.trusted),
                        "summary": status.summary(),
                    })
                except Exception as exc:
                    info.update({"integrity": None, "cryptographicValid": None, "trusted": False, "error": str(exc)})
                signatures.append(info)
            if not signatures:
                return {"status": "no-electronic-signature", "signatures": []}
            if any(s.get("cryptographicValid") is False or s.get("integrity") is False for s in signatures):
                result = "invalid"
            elif all(s.get("cryptographicValid") and s.get("trusted") for s in signatures):
                result = "verified"
            else:
                result = "unverifiable"
            return {"status": result, "signatures": signatures}
    except Exception as exc:
        return {"status": "unverifiable", "reason": str(exc)}

if __name__ == "__main__":
    print(json.dumps(run(sys.argv[1]), ensure_ascii=False))
