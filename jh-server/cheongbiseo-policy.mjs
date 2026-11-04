export const CHEONGBISEO_IMAGE_RETENTION_MS = 12 * 60 * 60 * 1000;
export const CHEONGBISEO_FILE_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

const IMAGE_EXT_RE = /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|tiff?|webp)$/i;

export function isImageFile(file = {}) {
  const mime = String(file.mime_type || file.mimeType || "").toLowerCase();
  const name = String(file.name || file.path || "");
  return mime.startsWith("image/") || IMAGE_EXT_RE.test(name);
}

export function createdAtMs(file = {}) {
  const raw = file.created_at ?? file.createdAt ?? file.uploaded_at ?? null;
  const value = raw ? Date.parse(String(raw)) : NaN;
  return Number.isFinite(value) ? value : null;
}

export function classifyCheongbiseoFile(file = {}, nowMs = Date.now()) {
  const born = createdAtMs(file);
  if (born === null) {
    return {status: "skip", reason: "created_at_missing", thresholdMs: null, ageMs: null};
  }
  const ageMs = nowMs - born;
  if (ageMs < 0) {
    return {status: "keep", reason: "future_timestamp", thresholdMs: null, ageMs};
  }
  const image = isImageFile(file);
  const thresholdMs = image ? CHEONGBISEO_IMAGE_RETENTION_MS : CHEONGBISEO_FILE_RETENTION_MS;
  const expired = ageMs >= thresholdMs;
  return {
    status: expired ? "expired" : "keep",
    reason: expired ? (image ? "image_over_12h" : "file_over_14d") : "within_retention",
    image,
    ageMs,
    thresholdMs
  };
}

export function cheongbiseoPolicy(spacePath = "/나의개인비서") {
  return {
    name: "청비서",
    executionMode: "manual_only",
    runTriggers: ["청비서 실행", "이미지 12시간 정리 실행", "파일 2주 정리 실행"],
    spacePath,
    imageRetentionHours: 12,
    nonImageRetentionDays: 14,
    imageRulePrecedence: true,
    deleteFolders: false,
    dryRunBeforeDelete: true,
    verifyAfterDelete: true,
    transientRetryLimit: 1,
    blockedMutationPolicy: "report_only",
    blockedCodes: ["project_library_mutation_unsupported"],
    connectorSyncedPolicy: "do_not_mutate",
    resultFields: ["candidateCount", "deletedCount", "blockedCount", "failedCount", "remainingExpiredCount"]
  };
}
