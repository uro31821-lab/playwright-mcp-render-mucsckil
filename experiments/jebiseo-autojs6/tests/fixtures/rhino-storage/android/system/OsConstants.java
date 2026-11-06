package android.system;

/** Test-only Android constants. Values are read through real public reflection. */
public final class OsConstants {
    public static final int O_RDONLY = 0;
    // O_DIRECTORY is intentionally absent: it is not in Android's public SDK.
    public static boolean S_ISDIR(int mode) { return (mode & 0xf000) == 0x4000; }
    private OsConstants() { }
}
