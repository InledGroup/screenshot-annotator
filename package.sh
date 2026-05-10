#!/bin/bash
UUID="screenshot-annotator@inled.es"
OUTPUT="$UUID.shell-extension.zip"

echo "📦 Generando paquete para GNOME Extensions Store..."

# Limpiar versiones anteriores
rm -f "$OUTPUT"

# Entrar al directorio de la extensión
cd extension

# Empaquetar solo los archivos necesarios
# Excluimos archivos de sistema, logs, o carpetas ocultas si las hubiera
python3 -m zipfile -c "../$OUTPUT" \
    extension.js \
    metadata.json \
    prefs.js \
    LICENSE \
    editor/ \
    schemas/

cd ..

echo "✅ Paquete generado: $OUTPUT"
echo "--------------------------------------------------"
echo "🔍 Verificando contenido del paquete..."
python3 -m zipfile -l "$OUTPUT" | grep -E "metadata.json|extension.js|LICENSE"
echo "--------------------------------------------------"
echo "🚀 Listo para subir a https://extensions.gnome.org/upload/"
