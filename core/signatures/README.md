# Firmas y Validación digitales y revisión visual de portada
La nueva pantalla funciona en Electron y examina archivos PDF de las carpetas UGPA y UTET configuradas en Escaneo. El análisis se inicia automáticamente después de un escaneo de carpetas y también desde la pantalla.

## Dependencia necesaria
Instalar Python 3.11+ y ejecutar:
```bash
python -m pip install -r core/signatures/requirements.txt
```
En Windows se usa `python` y en macOS/Linux `python3`. La variable `AUDIT_PYTHON` permite indicar el intérprete.

Para portadas escaneadas, instalar también Tesseract OCR con datos de español.
Compruebe que `tesseract --list-langs` incluya `spa`. En Windows puede definir
`AUDIT_TESSERACT` con la ruta completa a tesseract.exe. Si faltan el ejecutable
o el idioma, la portada queda pendiente y se reintenta al analizar.

## Seguridad y límites
- Solo lectura de archivos originales; los resultados se guardan en userData/signature-validation-v2.json.
- Se comprueba integridad criptográfica y cadena de confianza usando pyHanko sin descarga automática de información de revocación.
- Si no hay certificados de confianza configurados, una firma criptográficamente íntegra puede quedar **no verificable**, nunca se declara válida por apariencia.
- La fecha mostrada es **declarada**, no un sello de tiempo acreditado.
- Solo tras confirmar la ausencia de firmas digitales se renderiza la página 1. Se buscan rótulos en el texto del PDF o por OCR. Las casillas delimitadas se evalúan individualmente: posible trazo, espacio sin trazo visible o revisión necesaria. Un recorte facilita la comprobación. Los resultados visuales no autentican identidades ni evalúan fechas.
- Los rótulos no reconocidos o las casillas sin límites claros requieren revisión humana.
- No hay reglas temporales por documento todavía. Se restauró el margen de priorización original de 15 días. Este margen NO es un plazo de cumplimiento institucional; se deben incorporar los plazos del manual antes de declarar conformidad temporal.
- Priorización conserva las firmas digitales inválidas y añade una tarea de revisión para casillas vacías o dudosas identificadas explícitamente como «Firma obligatoria» o «Firma requerida».
- Antes de distribuir una versión instalable, empaquetar Python/pyHanko y configurar certificados de confianza para Ecuador; de lo contrario, el módulo requiere una instalación local adicional.

## Integridad y sincronización
- El servicio usa el inventario de cada escaneo. Solo reutiliza el resultado «sin firma electrónica» cuando coinciden el SHA-256 y la versión de la revisión visual y esta terminó sin error. Revalida las firmas en cada ejecución para considerar cambios en la confianza del certificado.
- Si se guarda otro escaneo durante la validación, el servicio vuelve a leer el inventario antes de finalizar.
- Si la carpeta está inaccesible o el recorrido es parcial, se conservan resultados anteriores marcados como obsoletos.
- Las tareas de firmas inválidas se incluyen en el modelo de Priorización y sus exportaciones. No se generan tareas desde resultados obsoletos.
- No se ha ejecutado una prueba integral del instalador ni con certificados reales de Ecuador. No usar el estado «verificado» como dictamen jurídico.
