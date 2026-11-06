package android.system;

/** Test-only value exposing the public st_mode field used by the adapter. */
public final class StructStat {
    public final int st_mode;

    StructStat(int mode) { st_mode = mode; }
}
