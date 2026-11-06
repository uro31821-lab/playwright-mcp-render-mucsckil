import java.io.FileDescriptor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.ScriptableObject;
import org.mozilla.javascript.TopLevel;

/** Real Rhino/JVM runner. Android system classes on this classpath are mocks. */
public final class StorageInterop {
    private static void checkMethod(Class<?> owner, String name, Class<?> result, Class<?>... arguments) throws Exception {
        Method method = owner.getMethod(name, arguments);
        if (!Modifier.isPublic(method.getModifiers()) || !Modifier.isStatic(method.getModifiers()) || method.getReturnType() != result) {
            throw new AssertionError("SDK_SIGNATURE_MISMATCH: " + owner.getName() + "." + name);
        }
    }

    private static void checkIntField(Class<?> owner, String name, boolean isStatic) throws Exception {
        Field field = owner.getField(name);
        if (!Modifier.isPublic(field.getModifiers()) || Modifier.isStatic(field.getModifiers()) != isStatic || field.getType() != int.class) {
            throw new AssertionError("SDK_FIELD_MISMATCH: " + owner.getName() + "." + name);
        }
    }

    private static String verifySdkSurface(Path sdkJar) throws Exception {
        // A null parent prevents the mock android.system classes on this runner's
        // classpath from satisfying the check. Never initialize or invoke SDK stubs.
        try (URLClassLoader sdk = new URLClassLoader(new URL[] {sdkJar.toUri().toURL()}, null)) {
            Class<?> os = Class.forName("android.system.Os", false, sdk);
            Class<?> constants = Class.forName("android.system.OsConstants", false, sdk);
            Class<?> stat = Class.forName("android.system.StructStat", false, sdk);
            Class<?> errno = Class.forName("android.system.ErrnoException", false, sdk);
            checkMethod(os, "open", FileDescriptor.class, String.class, int.class, int.class);
            checkMethod(os, "fstat", stat, FileDescriptor.class);
            checkMethod(os, "fsync", void.class, FileDescriptor.class);
            checkMethod(os, "close", void.class, FileDescriptor.class);
            checkMethod(constants, "S_ISDIR", boolean.class, int.class);
            checkIntField(constants, "O_RDONLY", true);
            checkIntField(stat, "st_mode", false);
            checkIntField(errno, "errno", false);
            try {
                constants.getField("O_DIRECTORY");
                throw new AssertionError("SDK_SURFACE_CHANGED: O_DIRECTORY is unexpectedly public; review the baseline");
            } catch (NoSuchFieldException expected) { /* The unsupported field must stay absent from this baseline. */ }
        }
        return "{\"status\":\"VERIFIED\",\"checkedMembers\":8,\"oDirectoryAbsent\":true}";
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 3 && args.length != 4) {
            throw new IllegalArgumentException("Expected production main.js, test harness, temporary state directory, and optional SDK android.jar");
        }
        String production = Files.readString(Path.of(args[0]), StandardCharsets.UTF_8);
        String harness = Files.readString(Path.of(args[1]), StandardCharsets.UTF_8);
        String sdkSurface = args.length == 4 ? verifySdkSurface(Path.of(args[3])) : "{\"status\":\"NOT_RUN\"}";
        Context context = Context.enter();
        try {
            context.setOptimizationLevel(-1);
            context.setLanguageVersion(Context.VERSION_ES6);
            TopLevel scope = context.initStandardObjects();
            ScriptableObject.putProperty(scope, "__interopRoot", Context.javaToJS(args[2], scope));
            ScriptableObject.putProperty(scope, "__sdkSurfaceJson", Context.javaToJS(sdkSurface, scope));
            // Evaluate the entire current production module. Dependencies are
            // unused by durableWrite and may not start a UI/phone workflow.
            context.evaluateString(scope,
                "var context; var module = {exports: {}};\n" +
                "function require(name) {\n" +
                "  if (['./core.js','./autojs-adapter.js','./journal.js','./report.js','./phone-launch.js'].indexOf(name) < 0)\n" +
                "    throw new Error('UNEXPECTED_REQUIRE');\n" +
                "  return {};\n" +
                "}\n",
                "storage-interop-bootstrap", 1, null);
            context.evaluateString(scope, production, args[0], 1, null);
            Object result = context.evaluateString(scope, harness, args[1], 1, null);
            System.out.println("RHINO_STORAGE_RESULT " + Context.toString(result));
        } finally {
            Context.exit();
        }
    }
}
