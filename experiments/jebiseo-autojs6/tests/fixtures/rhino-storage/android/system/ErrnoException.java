package android.system;

/** Test-only Android exception with the public errno shape used by production. */
public final class ErrnoException extends Exception {
    public final int errno;
    public final String functionName;

    public ErrnoException(String functionName, int errno) {
        super("PRIVATE_NATIVE_DETAIL_MUST_NOT_LEAK");
        this.functionName = functionName;
        this.errno = errno;
    }
}
