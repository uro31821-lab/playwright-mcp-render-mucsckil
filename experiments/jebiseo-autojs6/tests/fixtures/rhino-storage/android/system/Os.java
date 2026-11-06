package android.system;

import java.io.File;
import java.io.FileDescriptor;
import java.util.ArrayList;
import java.util.List;

/**
 * Test-only Android Os facade. It performs no real directory open/fsync/close.
 * Exact Java method signatures, primitive arguments, descriptor identity and
 * InvocationTargetException wrapping are exercised by the real JVM/Rhino.
 */
public final class Os {
    private static final List<String> events = new ArrayList<>();
    private static String scenario;
    private static String targetPath;
    private static FileDescriptor currentFd;
    private static boolean syncCalled;
    private static boolean closeCalled;

    private Os() { }

    public static void reset(String testScenario, String expectedTargetPath) {
        scenario = testScenario;
        targetPath = expectedTargetPath;
        currentFd = null;
        syncCalled = false;
        closeCalled = false;
        events.clear();
    }

    public static String events() {
        return String.join(",", events);
    }

    public static FileDescriptor open(String path, int flags, int mode) throws ErrnoException {
        events.add("open");
        File target = new File(targetPath).getAbsoluteFile();
        require(new File(path).getAbsoluteFile().equals(target.getParentFile()), "directory path type/value");
        require(flags == (OsConstants.O_RDONLY | OsConstants.O_DIRECTORY), "integer flags type/value");
        require(mode == 0, "integer mode type/value");
        require(target.isFile(), "atomic rename must precede directory open");
        require(!new File(targetPath + ".new").exists(), "temporary must be renamed before directory open");
        require(currentFd == null, "only one directory open");
        if ("open".equals(scenario)) throw new ErrnoException("open", 2);
        currentFd = new FileDescriptor();
        return currentFd;
    }

    public static void fsync(FileDescriptor fd) throws ErrnoException {
        events.add("fsync");
        require(fd == currentFd && currentFd != null, "FileDescriptor identity must survive reflection");
        require(!syncCalled && !closeCalled, "fsync once before close");
        syncCalled = true;
        if ("sync_close".equals(scenario)) throw new ErrnoException("fsync", 5);
    }

    public static void close(FileDescriptor fd) throws ErrnoException {
        events.add("close");
        require(fd == currentFd && currentFd != null, "close uses the opened descriptor");
        require(syncCalled && !closeCalled, "close once even when fsync fails");
        closeCalled = true;
        if ("close".equals(scenario) || "sync_close".equals(scenario)) throw new ErrnoException("close", 9);
    }

    private static void require(boolean condition, String reason) {
        if (!condition) throw new AssertionError("FIXTURE_CONTRACT: " + reason);
    }
}
