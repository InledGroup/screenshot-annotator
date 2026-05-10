#!/bin/bash

UUID="screenshot-annotator@gemini.cli"
DEST_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
ZIP_FILE="screenshot-annotator@gemini.cli.shell-extension.zip"

echo "🚀 Iniciando instalación de la extensión..."

# 1. Generar el paquete
./package.sh

# 2. Eliminar instalación anterior si existe
if [ -d "$DEST_DIR" ]; then
    echo "🗑️ Eliminando versión anterior en $DEST_DIR..."
    rm -rf "$DEST_DIR"
fi

# 3. Crear directorio y extraer
echo "📂 Instalando nueva versión..."
mkdir -p "$DEST_DIR"
unzip -q "$ZIP_FILE" -d "$DEST_DIR"

# 4. Limpiar el zip temporal
rm "$ZIP_FILE"

echo "✨ Instalación completada con éxito."
echo "⚠️ Recuerda reiniciar GNOME Shell (Alt+F2 -> r en X11 o Cerrar sesión en Wayland)."
echo "Habilitando extensión..."
gnome-extensions enable "$UUID" 2>/dev/null || echo "Nota: La extensión se habilitará tras reiniciar Shell."
