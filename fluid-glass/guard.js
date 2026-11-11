import GObject from 'gi://GObject';

/**
 * Guard against GLib GType duplicate registration errors during extension reload / re-evaluation.
 * In GLib, registered GType names can never be unregistered. If GJS evaluates a module again
 * (or dynamic import / reload occurs), GObject.registerClass throws "Error: Type name ... is already registered".
 * This guard catches that condition, assigns a safe unique GTypeName, and caches the class.
 */
if (!GObject._origRegisterClass) {
    GObject._origRegisterClass = GObject.registerClass;
    GObject.registerClass = function(...args) {
        let metadata, classDef;
        if (args.length === 1) {
            metadata = {};
            classDef = args[0];
        } else {
            metadata = Object.assign({}, args[0]);
            classDef = args[1];
        }
        const baseName = metadata.GTypeName || classDef?.name || 'GjsAnonymousClass';
        const cacheKey = '__fg_gclass_' + baseName;
        if (globalThis[cacheKey]) {
            return globalThis[cacheKey];
        }
        try {
            const registered = GObject._origRegisterClass.apply(GObject, args);
            globalThis[cacheKey] = registered;
            return registered;
        } catch (e) {
            if (e.message && e.message.includes('already registered')) {
                let counter = 1;
                let altName = `FluidGlass_${baseName}_${counter++}`;
                while (GObject.type_from_name(altName)) {
                    altName = `FluidGlass_${baseName}_${counter++}`;
                }
                metadata.GTypeName = altName;
                const registered = GObject._origRegisterClass.call(GObject, metadata, classDef);
                globalThis[cacheKey] = registered;
                return registered;
            }
            throw e;
        }
    };
}
