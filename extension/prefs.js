import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ScreenshotAnnotatorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup();
        page.add(group);

        const row = new Adw.ActionRow({
            title: 'Carpeta de capturas',
            subtitle: settings.get_string('screenshot-directory') || 'Detección automática',
        });
        group.add(row);

        const button = new Gtk.Button({
            icon_name: 'folder-open-symbolic',
            valign: Gtk.Align.CENTER,
        });
        row.add_suffix(button);

        button.connect('clicked', () => {
            const chooser = new Gtk.FileChooserNative({
                title: 'Seleccionar carpeta de capturas',
                action: Gtk.FileChooserAction.SELECT_FOLDER,
                transient_for: window,
                modal: true,
            });

            chooser.connect('response', (self, response) => {
                if (response === Gtk.ResponseType.ACCEPT) {
                    const path = self.get_file().get_path();
                    settings.set_string('screenshot-directory', path);
                    row.subtitle = path;
                }
                self.destroy();
            });

            chooser.show();
        });

        window.add(page);
    }
}
