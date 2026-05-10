import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

/**
 * Screenshot Annotator Extension
 * NOTE: the /assets folder contains the modules used by the extension. Due to GNOME Extensions rules, this assets cannot be imported from the internet, so I bundled them locally.
 * The assets included are:
 * - Tesseract OCR core in WASM
 * - Tesseract training data
 * - Tesseract js minified
 * - Worker (tesseract-worker.js)
 * - Fabric js minified
 * - Fontawesome css
 * - Webfonts
 * To simplify the review process, you can scan this with VirusTotal, who analyzes the files for malicious content.
 * If you need any change, please contact me.
 */
export default class ScreenshotAnnotatorExtension extends Extension {
  enable() {
    console.log(`[Screenshot Annotator] v29 enabled`);
    this._monitor = null;
    this._lastLaunchTime = 0;
    this._ignoredPaths = new Map();
    this._timeouts = new Set();
    this._childWatches = new Set();

    this._settings = this.getSettings();
    // Watch for settings changes to restart monitor
    this._settingsId = this._settings.connect(
      "changed::screenshot-directory",
      () => {
        this._setupMonitor();
      },
    );

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

    for (const t of this._timeouts) GLib.source_remove(t);
    this._timeouts.clear();
    for (const w of this._childWatches) GLib.source_remove(w);
    this._childWatches.clear();

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
    const savedPath = this._settings.get_string("screenshot-directory");

    if (savedPath && savedPath.trim() !== "") {
      const dir = Gio.File.new_for_path(savedPath);
      if (dir.query_exists(null)) {
        screenshotDir = dir;
      } else {
        console.error(
          `[Screenshot Annotator] Configured path does not exist: ${savedPath}`,
        );
      }
    }

    // Auto-detect if no valid path configured
    if (!screenshotDir) {
      const picturesDir = GLib.get_user_special_dir(
        GLib.UserDirectory.DIRECTORY_PICTURES,
      );
      if (!picturesDir) return;

      const candidates = ["Screenshots", "Capturas de pantalla", "Capturas"];
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

    console.log(
      `[Screenshot Annotator] Monitoring: ${screenshotDir.get_path()}`,
    );

    this._monitor = screenshotDir.monitor_directory(
      Gio.FileMonitorFlags.NONE,
      null,
    );
    this._monitor.connect("changed", (monitor, file, otherFile, eventType) => {
      const path = file.get_path();
      const fileName = file.get_basename();
      const now = Date.now();

      if (fileName.startsWith(".")) return;

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
      if (
        eventType === Gio.FileMonitorEvent.CREATED ||
        eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT
      ) {
        if (path.match(/\.(png|jpg|jpeg)$/i)) {
          // Strict debounce: don't even look at the file if we launched anything in the last 3s
          if (now - this._lastLaunchTime < 3000) return;

          // Double-check ignore map again right before triggering
          if (this._ignoredPaths.has(path)) return;

          console.log(
            `[Screenshot Annotator] New screenshot detected: ${path}`,
          );

          // CRITICAL: Block the path IMMEDIATELY before doing anything else
          this._ignoredPaths.set(path, now + 15000);
          this._lastLaunchTime = now;

          const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._timeouts.delete(timeoutId);
            // Final check after timeout to ensure no other event slipped through
            if (this._ignoredPaths.get(path) > Date.now() + 10000) {
              this._launchEditor(path);
            }
            return GLib.SOURCE_REMOVE;
          });
          this._timeouts.add(timeoutId);
        }
      }
    });
  }

  _launchEditor(imagePath) {
    const editorPath = GLib.build_filenamev([this.path, "editor", "main.js"]);
    const editorFile = Gio.File.new_for_path(editorPath);

    if (!editorFile.query_exists(null)) {
      console.error(
        `[Screenshot Annotator] CRITICAL: Editor script not found at ${editorPath}`,
      );
      return;
    }

    console.log(
      `[Screenshot Annotator] Launching editor: ${editorPath} with image: ${imagePath}`,
    );

    try {
      const proc = new Gio.Subprocess({
        argv: ["gjs", "-m", editorPath, imagePath],
        flags:
          Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
      });
      proc.init(null);

      proc.wait_check_async(null, (p, res) => {
        try {
          p.wait_check_finish(res);
          console.log(
            `[Screenshot Annotator] Editor process exited successfully.`,
          );
        } catch (e) {
          console.error(
            `[Screenshot Annotator] Editor process failed: ${e.message}`,
          );
        } finally {
          this._ignoredPaths.set(imagePath, Date.now() + 10000);
        }
      });

      // Log stderr to help debugging
      proc
        .get_stderr_pipe()
        .read_bytes_async(4096, GLib.PRIORITY_DEFAULT, null, (stream, res) => {
          try {
            const bytes = stream.read_bytes_finish(res);
            if (bytes.get_size() > 0) {
              const decoder = new TextDecoder();
              console.error(
                `[Screenshot Annotator] Editor STDERR: ${decoder.decode(bytes.toArray())}`,
              );
            }
          } catch (e) {}
        });
    } catch (e) {
      console.error(`[Screenshot Annotator] Spawn error: ${e.message}`);
      this._ignoredPaths.delete(imagePath);
    }
  }
}
