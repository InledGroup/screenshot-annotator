#!/bin/bash
UUID="screenshot-annotator@inled.es"
DEST_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
ZIP_FILE="screenshot-annotator@inled.es.shell-extension.zip"

echo "🚀 Iniciando instalación de la extensión v28..."

# 1. Generar el paquete
./package.sh

# 2. Eliminar instalación anterior si existe
if [ -d "$DEST_DIR" ]; then
    echo "🗑️ Eliminando versión anterior..."
    rm -rf "$DEST_DIR"
fi

# 3. Crear directorio y extraer
echo "📂 Instalando nueva versión..."
mkdir -p "$DEST_DIR"
unzip -q "$ZIP_FILE" -d "$DEST_DIR"

# 4. Compilar esquemas GSettings
echo "⚙️ Compilando esquemas GSettings..."
glib-compile-schemas "$DEST_DIR/schemas/"

# 5. Limpiar el zip temporal
rm "$ZIP_FILE"

echo "✨ Instalación completada."
echo "⚠️ IMPORTANTE: Reinicia GNOME Shell (Alt+F2 -> r)."
gnome-extensions enable "$UUID" 2>/dev/null
