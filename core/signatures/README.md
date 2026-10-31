# Firmas y Validación (primera etapa)
La nueva pantalla funciona en Electron y examina archivos PDF de las carpetas UGPA y UTET configuradas en Escaneo. El análisis se inicia automáticamente después de un escaneo de carpetas y también desde la pantalla.

## Dependencia necesaria
Instalar Python 3.11+ y ejecutar:
```bash
python -m pip install -r core/signatures/requirements.txt
```
En Windows se usa `python` y en macOS/Linux `python3`. La variable `AUDIT_PYTHON` permite indicar el intérprete.

## Seguridad y límites
- Solo lectura de archivos originales; los resultados se guardan en userData/signature-validation-v1.json.
- Se comprueba integridad criptográfica y cadena de confianza usando pyHanko sin descarga automática de información de revocación.
- Si no hay certificados de confianza configurados, una firma criptográficamente íntegra puede quedar **no verificable**, nunca se declara válida por apariencia.
- La fecha mostrada es **declarada**, no un sello de tiempo acreditado.
- No se verifican firmas manuscritas, ni se extraen aún fechas de portada.
- No hay reglas temporales por documento todavía. La ampliación de la ventana general de cierre a 90 días es provisional; se deben incorporar plazos específicos del manual antes de declarar conformidad temporal.
- Priorización incorpora solo firmas criptográficamente inválidas, no ausencias ni validaciones inconclusas.
- Antes de distribuir una versión instalable, empaquetar Python/pyHanko y configurar certificados de confianza para Ecuador; de lo contrario, el módulo requiere una instalación local adicional.
