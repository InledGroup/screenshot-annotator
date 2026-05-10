#!/usr/bin/env gjs

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import system from 'system';

console.log("[Screenshot Annotator Editor] Script started");

let Gtk, WebKit, Gdk, GdkPixbuf;
let isGtk4 = false;

// We check for WebKit version first to decide the stack, 
// because once a version of a GI module is checked/tried, GJS locks it.
try {
    // Try to peek WebKit 6.0 without full import first? 
    // Actually, the most reliable way in ESM is to catch the failed import of the specific version.
    // The previous error "Version 4.0 already loaded" happened because GTK 4.0 import succeeded 
    // but WebKit 6.0 failed, leaving GTK 4.0 "locked" in the process.
    
    const WebKitModule = await import('gi://WebKit?version=6.0');
    WebKit = WebKitModule.default;
    
    const GtkModule = await import('gi://Gtk?version=4.0');
    Gtk = GtkModule.default;
    
    const GdkModule = await import('gi://Gdk?version=4.0');
    Gdk = GdkModule.default;
    
    isGtk4 = true;
    console.log("[Screenshot Annotator Editor] Using GTK4 and WebKit 6.0");
} catch (e) {
    console.log("[Screenshot Annotator Editor] GTK4/WebKit6 stack failed, trying GTK3/WebKit2");
    
    // In GJS, if the previous 'import' partially succeeded (e.g. Gtk 4.0 worked but WebKit failed),
    // we might be stuck. However, since we are in a fresh process, we can control the order.
    
    const GtkModule = await import('gi://Gtk?version=3.0');
    Gtk = GtkModule.default;
    const WebKitModule = await import('gi://WebKit2?version=4.1');
    WebKit = WebKitModule.default;
    const GdkModule = await import('gi://Gdk?version=3.0');
    Gdk = GdkModule.default;
    const GdkPixbufModule = await import('gi://GdkPixbuf');
    GdkPixbuf = GdkPixbufModule.default;
    
    isGtk4 = false;
    console.log("[Screenshot Annotator Editor] Using GTK3 and WebKit2 4.1");
}

function getBase64(path) {
    try {
        let file = Gio.File.new_for_path(path);
        if (!file.query_exists(null)) return null;
        let [success, contents] = file.load_contents(null);
        if (success) {
            return 'data:image/png;base64,' + GLib.base64_encode(contents);
        }
    } catch (e) {
        console.error(`[Screenshot Annotator Editor] Error reading file: ${e.message}`);
    }
    return null;
}

if (isGtk4) {
    const app = new Gtk.Application({
        application_id: 'org.gnome.shell.extensions.screenshotannotator.editor',
        flags: Gio.ApplicationFlags.FLAGS_NONE
    });

    app.connect('activate', () => {
        const args = system.programArgs;
        if (args.length === 0) { app.quit(); return; }
        const imagePath = args[0];

        const win = new Gtk.ApplicationWindow({
            application: app,
            title: 'Screenshot Editor',
            default_width: 1100,
            default_height: 850,
        });

        const contentManager = new WebKit.UserContentManager();
        const webView = new WebKit.WebView({ user_content_manager: contentManager });
        
        const settings = webView.get_settings();
        settings.set_enable_write_console_messages_to_stdout(true);
        settings.set_enable_developer_extras(true);
        settings.set_allow_universal_access_from_file_urls(true);
        settings.set_allow_file_access_from_file_urls(true);

        webView.set_background_color(new Gdk.RGBA({ red: 0, green: 0, blue: 0, alpha: 0 }));

        contentManager.register_script_message_handler('app');
        contentManager.connect('script-message-received::app', (manager, message) => {
            const body = message.get_js_value().to_string();
            const { action, data } = JSON.parse(body);
            const clipboard = Gdk.Display.get_default().get_clipboard();
            
            if (action === 'save') {
                const bytes = GLib.base64_decode(data.base64.split(',')[1]);
                Gio.File.new_for_path(imagePath).replace_contents_async(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null, (f, res) => {
                    try { f.replace_contents_finish(res); } catch(e) {}
                    win.destroy();
                });
            } else if (action === 'copy') {
                const bytes = GLib.base64_decode(data.base64.split(',')[1]);
                try {
                    const texture = Gdk.Texture.new_from_bytes(new GLib.Bytes(bytes));
                    clipboard.set_texture(texture);
                } catch (e) { console.error("Clipboard error:", e); }
            } else if (action === 'copy_text') {
                clipboard.set_text(data.text);
            } else if (action === 'close') win.destroy();
        });

        win.set_child(webView);
        const scriptPath = import.meta.url.replace('file://', '');
        const scriptDir = GLib.path_get_dirname(scriptPath);
        const uiPath = GLib.build_filenamev([scriptDir, 'ui', 'index.html']);
        
        webView.load_uri('file://' + uiPath);
        webView.connect('load-changed', (wv, event) => {
            if (event === WebKit.LoadEvent.FINISHED) {
                const base64Data = getBase64(imagePath);
                const payload = JSON.stringify({ action: 'init', data: { imageBase64: base64Data } });
                webView.evaluate_javascript(`window.handleMessage(${payload})`, -1, null, null, null, null, null);
            }
        });
        win.present();
    });
    app.run([system.programInvocationName, ...system.programArgs]);
} else {
    // GTK3 Implementation
    Gtk.init(null);
    const args = system.programArgs;
    if (args.length === 0) {
        console.error("No image path provided");
        system.exit(1);
    }
    const imagePath = args[0];

    const win = new Gtk.Window({
        type: Gtk.WindowType.TOPLEVEL,
        title: 'Screenshot Editor',
        default_width: 1100,
        default_height: 850,
    });
    win.set_position(Gtk.WindowPosition.CENTER);

    const contentManager = new WebKit.UserContentManager();
    const webView = new WebKit.WebView({ user_content_manager: contentManager });
    
    const settings = webView.get_settings();
    settings.set_enable_write_console_messages_to_stdout(true);
    settings.set_enable_developer_extras(true);
    settings.set_allow_universal_access_from_file_urls(true);
    settings.set_allow_file_access_from_file_urls(true);

    webView.set_background_color(new Gdk.RGBA({ red: 0, green: 0, blue: 0, alpha: 0 }));

    contentManager.register_script_message_handler('app');
    contentManager.connect('script-message-received::app', (manager, message) => {
        const body = message.get_js_value().to_string();
        const { action, data } = JSON.parse(body);
        
        if (action === 'save') {
            const bytes = GLib.base64_decode(data.base64.split(',')[1]);
            Gio.File.new_for_path(imagePath).replace_contents_async(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null, (f, res) => {
                try { f.replace_contents_finish(res); } catch(e) {}
                win.destroy();
            });
        } else if (action === 'copy') {
            const bytes = GLib.base64_decode(data.base64.split(',')[1]);
            GdkPixbuf.Pixbuf.new_from_stream_async(Gio.MemoryInputStream.new_from_bytes(new GLib.Bytes(bytes)), null, (s, res) => {
                try {
                    const pixbuf = GdkPixbuf.Pixbuf.new_from_stream_finish(res);
                    Gtk.Clipboard.get(Gdk.Atom.intern('CLIPBOARD', false)).set_image(pixbuf);
                } catch(e) { console.error("Clipboard error:", e); }
            });
        } else if (action === 'copy_text') {
            Gtk.Clipboard.get(Gdk.Atom.intern('CLIPBOARD', false)).set_text(data.text, -1);
        } else if (action === 'close') win.destroy();
    });

    win.add(webView);
    
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
    Gtk.main();
}
