# Firmas y Validación (primera etapa)
La nueva pantalla funciona en Electron y examina archivos PDF de las carpetas UGPA y UTET configuradas en Escaneo. El análisis se inicia automáticamente después de un escaneo de carpetas y también desde la pantalla.

## Dependencia necesaria
Instalar Python 3.11+ y ejecutar:
```bash
python -m pip install -r core/signatures/requirements.txt
```
En Windows se usa `python` y en macOS/Linux `python3`. La variable `AUDIT_PYTHON` permite indicar el intérprete.

## Seguridad y límites
- Solo lectura de archivos originales; los resultados se guardan en userData/signature-validation-v2.json.
- Se comprueba integridad criptográfica y cadena de confianza usando pyHanko sin descarga automática de información de revocación.
- Si no hay certificados de confianza configurados, una firma criptográficamente íntegra puede quedar **no verificable**, nunca se declara válida por apariencia.
- La fecha mostrada es **declarada**, no un sello de tiempo acreditado.
- No se verifican firmas manuscritas, ni se extraen aún fechas de portada.
- No hay reglas temporales por documento todavía. Se restauró el margen de priorización original de 15 días. Este margen NO es un plazo de cumplimiento institucional; se deben incorporar los plazos del manual antes de declarar conformidad temporal.
- Priorización incorpora solo firmas criptográficamente inválidas, no ausencias ni validaciones inconclusas.
- Antes de distribuir una versión instalable, empaquetar Python/pyHanko y configurar certificados de confianza para Ecuador; de lo contrario, el módulo requiere una instalación local adicional.

## Integridad y sincronización
- La caché compara SHA-256 del archivo, no solo tamaño y fecha.
- Los escaneos concurrentes comparten una misma ejecución.
- Si la carpeta está inaccesible o el recorrido es parcial, se conservan resultados anteriores marcados como obsoletos.
- Las tareas de firmas inválidas se incluyen en el modelo de Priorización y sus exportaciones. No se generan tareas desde resultados obsoletos.
- No se ha ejecutado una prueba integral del instalador ni con certificados reales de Ecuador. No usar el estado «verificado» como dictamen jurídico.
