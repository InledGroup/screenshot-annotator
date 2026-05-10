#!/bin/bash
OUTPUT="screenshot-annotator@inled.es.shell-extension.zip"
echo "📦 Generando paquete V12 (Python ZIP)..."
rm -f "$OUTPUT"
cd extension
# Como no tienes 'zip', usamos python3 que sí está disponible
python3 -m zipfile -c "../$OUTPUT" .
cd ..
echo "✅ Paquete generado: $OUTPUT"
