import { ExtensionPreferences } from 'resource:///org/gnome/shell/extensions/prefs.js';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

export default class ScreenshotAnnotatorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'Configuración',
            description: 'Configura la carpeta donde la extensión debe buscar nuevas capturas de pantalla.'
        });

        const row = new Adw.ActionRow({
            title: 'Carpeta de Capturas',
            subtitle: settings.get_string('screenshot-directory') || 'Detección automática'
        });

        const fileButton = new Gtk.Button({
            icon_name: 'folder-open-symbolic',
            valign: Gtk.Align.CENTER,
            margin_start: 10
        });

        fileButton.connect('clicked', () => {
            const dialog = new Gtk.FileChooserDialog({
                title: 'Seleccionar carpeta de capturas',
                action: Gtk.FileChooserAction.SELECT_FOLDER,
                transient_for: window.get_root(),
                modal: true
            });

            dialog.add_button('Cancelar', Gtk.ResponseType.CANCEL);
            dialog.add_button('Seleccionar', Gtk.ResponseType.ACCEPT);

            dialog.connect('response', (d, response) => {
                if (response === Gtk.ResponseType.ACCEPT) {
                    const path = d.get_file().get_path();
                    settings.set_string('screenshot-directory', path);
                    row.set_subtitle(path);
                }
                d.destroy();
            });

            dialog.show();
        });

        const resetButton = new Gtk.Button({
            icon_name: 'edit-clear-symbolic',
            valign: Gtk.Align.CENTER,
            margin_start: 5
        });

        resetButton.connect('clicked', () => {
            settings.set_string('screenshot-directory', '');
            row.set_subtitle('Detección automática');
        });

        const box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        box.append(fileButton);
        box.append(resetButton);

        row.add_suffix(box);
        group.add(row);
        page.add(group);
        window.add(page);
    }
}
