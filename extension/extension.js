import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

/**
 * Screenshot Annotator Extension
 * Professional-grade extension to annotate screenshots with a macOS-like UI.
 */
export default class ScreenshotAnnotatorExtension extends Extension {
    enable() {
        console.log(`[Screenshot Annotator] v29 enabled`);
        this._monitor = null;
        this._lastLaunchTime = 0;
        this._ignoredPaths = new Map();
        
        this._settings = this.getSettings();
        // Watch for settings changes to restart monitor
        this._settingsId = this._settings.connect('changed::screenshot-directory', () => {
            this._setupMonitor();
        });

        this._setupMonitor();
    }

    disable() {
        if (this._monitor) {
            this._monitor.cancel();
            this._monitor = null;
        }
        if (this._settingsId) {
            this._settings.disconnect(this._settingsId);
            this._settingsId = 0;
        }
        this._settings = null;
        this._ignoredPaths.clear();
    }

    _setupMonitor() {
        // Cancel existing monitor if any
        if (this._monitor) {
            this._monitor.cancel();
            this._monitor = null;
        }

        let screenshotDir = null;
        const savedPath = this._settings.get_string('screenshot-directory');

        if (savedPath && savedPath.trim() !== '') {
            const dir = Gio.File.new_for_path(savedPath);
            if (dir.query_exists(null)) {
                screenshotDir = dir;
            } else {
                console.error(`[Screenshot Annotator] Configured path does not exist: ${savedPath}`);
            }
        }

        // Auto-detect if no valid path configured
        if (!screenshotDir) {
            const picturesDir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES);
            if (!picturesDir) return;

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
        }

        console.log(`[Screenshot Annotator] Monitoring: ${screenshotDir.get_path()}`);

        this._monitor = screenshotDir.monitor_directory(Gio.FileMonitorFlags.NONE, null);
        this._monitor.connect('changed', (monitor, file, otherFile, eventType) => {
            const path = file.get_path();
            const fileName = file.get_basename();
            const now = Date.now();
            
            if (fileName.startsWith('.')) return;

            // Check ignore list immediately
            if (this._ignoredPaths.has(path)) {
                const expiry = this._ignoredPaths.get(path);
                if (now < expiry) {
                    // Refresh ignore timer on activity to stay ahead of the system events
                    this._ignoredPaths.set(path, now + 5000);
                    return;
                }
                this._ignoredPaths.delete(path);
            }

            // Event 1 = CREATED, Event 3 = CHANGES_DONE_HINT
            if (eventType === Gio.FileMonitorEvent.CREATED || eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT) {
                if (path.match(/\.(png|jpg|jpeg)$/i)) {
                    // Strict debounce: don't even look at the file if we launched anything in the last 3s
                    if (now - this._lastLaunchTime < 3000) return;

                    // Double-check ignore map again right before triggering
                    if (this._ignoredPaths.has(path)) return;

                    console.log(`[Screenshot Annotator] New screenshot detected: ${path}`);
                    
                    // CRITICAL: Block the path IMMEDIATELY before doing anything else
                    this._ignoredPaths.set(path, now + 15000);
                    this._lastLaunchTime = now;

                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                        // Final check after timeout to ensure no other event slipped through
                        if (this._ignoredPaths.get(path) > (Date.now() + 10000)) {
                             this._launchEditor(path);
                        }
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
        
        console.log(`[Screenshot Annotator] Launching editor: ${imagePath}`);
        try {
            let [success, pid] = GLib.spawn_async(null, argv, env, GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD, null);
            
            if (success) {
                GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, (pid, status) => {
                    console.log(`[Screenshot Annotator] Editor closed. Ignoring ${imagePath} for 10s more.`);
                    this._ignoredPaths.set(imagePath, Date.now() + 10000);
                    GLib.spawn_close_pid(pid);
                });
            }
        } catch (e) {
            console.error(`[Screenshot Annotator] Launch error: ${e.message}`);
            this._ignoredPaths.delete(imagePath); // Clear on error
        }
    }
}
