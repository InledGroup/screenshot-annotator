#!/usr/bin/env gjs

import Gtk from 'gi://Gtk?version=3.0';
import WebKit from 'gi://WebKit2?version=4.1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=3.0';
import GdkPixbuf from 'gi://GdkPixbuf';
import system from 'system';

function getBase64(path) {
    try {
        let file = Gio.File.new_for_path(path);
        let [success, contents] = file.load_contents(null);
        if (success) {
            return 'data:image/png;base64,' + GLib.base64_encode(contents);
        }
    } catch (e) {
        return null;
    }
    return null;
}

function createEditorWindow(imagePath) {
    const win = new Gtk.Window({
        type: Gtk.WindowType.TOPLEVEL,
        title: 'Screenshot Editor',
        default_width: 1100,
        default_height: 850,
    });
    win.set_position(Gtk.WindowPosition.CENTER);

    const contentManager = new WebKit.UserContentManager();
    const webView = new WebKit.WebView({
        user_content_manager: contentManager
    });
    
    // Transparent background for webview
    const transparentColor = new Gdk.RGBA({ red: 0, green: 0, blue: 0, alpha: 0 });
    webView.set_background_color(transparentColor);

    contentManager.register_script_message_handler('app');
    contentManager.connect('script-message-received::app', (manager, message) => {
        const body = message.get_js_value().to_string();
        const { action, data } = JSON.parse(body);
        
        if (action === 'save') {
            const bytes = GLib.base64_decode(data.base64.split(',')[1]);
            Gio.File.new_for_path(imagePath).replace_contents_async(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null, (f, res) => {
                f.replace_contents_finish(res);
                win.destroy();
            });
        } else if (action === 'copy') {
            const bytes = GLib.base64_decode(data.base64.split(',')[1]);
            GdkPixbuf.Pixbuf.new_from_stream_async(Gio.MemoryInputStream.new_from_bytes(new GLib.Bytes(bytes)), null, (s, res) => {
                Gtk.Clipboard.get(Gdk.Atom.intern('CLIPBOARD', false)).set_image(GdkPixbuf.Pixbuf.new_from_stream_finish(res));
            });
        } else if (action === 'close') win.destroy();
    });

    win.add(webView);
    webView.show();

    const scriptPath = import.meta.url.replace('file://', '');
    const scriptDir = GLib.path_get_dirname(scriptPath);
    const uiPath = GLib.build_filenamev([scriptDir, 'ui', 'index.html']);
    
    webView.load_uri('file://' + uiPath);
    webView.connect('load-changed', (wv, event) => {
        if (event === WebKit.LoadEvent.FINISHED) {
            const base64Data = getBase64(imagePath);
            const payload = JSON.stringify({ action: 'init', data: { imageBase64: base64Data } });
            webView.run_javascript(`window.handleMessage(${payload})`, null, null);
        }
    });

    win.connect('destroy', () => { Gtk.main_quit(); });
    win.show_all();
}

Gtk.init(null);
const args = system.programArgs;
if (args.length > 0) {
    createEditorWindow(args[0]);
    Gtk.main();
}
