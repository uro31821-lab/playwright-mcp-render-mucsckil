import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.ScriptableObject;
import org.mozilla.javascript.TopLevel;

/** Real Rhino/JVM runner. Android system classes on this classpath are mocks. */
public final class StorageInterop {
    public static void main(String[] args) throws Exception {
        if (args.length != 3) {
            throw new IllegalArgumentException("Expected production main.js, test harness, and temporary state directory");
        }
        String production = Files.readString(Path.of(args[0]), StandardCharsets.UTF_8);
        String harness = Files.readString(Path.of(args[1]), StandardCharsets.UTF_8);
        Context context = Context.enter();
        try {
            context.setOptimizationLevel(-1);
            context.setLanguageVersion(Context.VERSION_ES6);
            TopLevel scope = context.initStandardObjects();
            ScriptableObject.putProperty(scope, "__interopRoot", Context.javaToJS(args[2], scope));
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
