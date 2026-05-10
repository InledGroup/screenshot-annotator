import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

/**
 * Screenshot Annotator Extension
 * Professional-grade extension to annotate screenshots with a macOS-like UI.
 */
export default class ScreenshotAnnotatorExtension extends Extension {
    enable() {
        console.log(`[Screenshot Annotator] v20 enabled - Stability Core`);
        this._monitor = null;
        this._lastLaunch = 0;
        this._mutedFiles = new Map(); // path -> expiry timestamp
        this._setupMonitor();
    }

    disable() {
        if (this._monitor) {
            this._monitor.cancel();
            this._monitor = null;
        }
        this._mutedFiles.clear();
    }

    _setupMonitor() {
        const picturesDir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES);
        if (!picturesDir) return;

        // Detect localized Screenshot folder
        let screenshotDir = null;
        const candidates = ['Screenshots', 'Capturas de pantalla', 'Capturas'];
        for (const name of candidates) {
            const path = GLib.build_filenamev([picturesDir, name]);
            const dir = Gio.File.new_for_path(path);
            if (dir.query_exists(null)) {
                screenshotDir = dir;
                break;
            }
        }
        if (!screenshotDir) screenshotDir = Gio.File.new_for_path(picturesDir);

        console.log(`[Screenshot Annotator] Monitoring: ${screenshotDir.get_path()}`);

        this._monitor = screenshotDir.monitor_directory(Gio.FileMonitorFlags.NONE, null);
        this._monitor.connect('changed', (monitor, file, otherFile, eventType) => {
            const path = file.get_path();

            // 1. Check if path is muted (to prevent save-loop)
            if (this._mutedFiles.has(path)) {
                const expiry = this._mutedFiles.get(path);
                if (Date.now() < expiry) return;
                this._mutedFiles.delete(path);
            }

            // 2. Filter events
            if (eventType === Gio.FileMonitorEvent.CREATED || eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT) {
                if (path.match(/\.(png|jpg|jpeg)$/i)) {
                    // 3. Debounce rapid identical events
                    const now = Date.now();
                    if (now - this._lastLaunch < 2000) return;
                    this._lastLaunch = now;

                    console.log(`[Screenshot Annotator] Processing new file: ${path}`);
                    
                    // 4. Mute the file immediately to avoid loop when editor saves
                    this._mutedFiles.set(path, Date.now() + 15000); // Mute for 15s (plenty of time to edit)

                    // 5. Spawn editor with full environment
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 800, () => {
                        this._launchEditor(path);
                        return GLib.SOURCE_REMOVE;
                    });
                }
            }
        });
    }

    _launchEditor(imagePath) {
        const editorPath = GLib.build_filenamev([this.path, 'editor', 'main.js']);
        const argv = ['gjs', '-m', editorPath, imagePath];
        const env = GLib.get_environ();
        
        try {
            GLib.spawn_async(
                null, argv, env, 
                GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD, 
                null
            );
        } catch (e) {
            console.error(`[Screenshot Annotator] Launch error: ${e.message}`);
        }
    }
}
