
async function check() {
    const paths = [
        'resource:///org/gnome/shell/extensions/prefs.js',
        'resource:///org/gnome/shell/extensions/preferences.js',
        'resource:///org/gnome/shell/extensions/extension.js',
        'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js',
        'resource:///org/gnome/Shell/Extensions/js/preferences.js'
    ];

    for (const path of paths) {
        try {
            const m = await import(path);
            print(`✅ FOUND: ${path}`);
            if (m.ExtensionPreferences) print('   -> contains ExtensionPreferences');
            if (m.Extension) print('   -> contains Extension');
        } catch (e) {
            print(`❌ FAIL: ${path} (${e.message.split('\n')[0]})`);
        }
    }
}

check();
