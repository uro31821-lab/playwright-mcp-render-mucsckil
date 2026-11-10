/*
 * JH Glass P-256 AndroidKeyStore signer — development candidate only.
 * Source is compiled with pinned official Meta CameraAccess sample. This is
 * NOT yet connected to JH's real initial approval, photo ingress or MCP tools.
 *
 * The non-exportable private key is generated only at explicit enrollment.
 * It is used only by app event-handler code that is called after a user has
 * explicitly requested a photo to be sent. No MediaProjection permissions,
 * background capture, remote auto-clicking or OpenAI API calls.
 */
package com.meta.wearable.dat.externalsampleapps.cameraaccess.jhglass

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec

private const val KEY_ALIAS = "jh_glass_device_p256_v1"
private const val OWNER_RE = "^owner:[a-f0-9]{64}$"
private const val HEX_RE = "^[a-f0-9]{64}$"
private const val CLAIM_RE = "^[A-Za-z0-9_-]{32}$"
private const val ENROLL_RE = "^[A-Za-z0-9_-]{43}$"

data class JhDeviceEnrollmentKey(
    val publicKeyBase64Url: String,
    val publicKeyDigest: String,
)
data class JhDevicePhotoIntent(
    val requestId: String,
    val deviceDigest: String,
    val photoSha256: String,
    val issuedAt: Long,
    val nonce: String,
    val signature: String,
) {
    override fun toString(): String = "JhDevicePhotoIntent(<redacted>)"
}

/**
 * AndroidKeyStore private key never leaves the phone, isn't copied to disk,
 * never embedded in APK, and isn't exposed to JS/Intents/clipboard.
 *
 * An explicit one-time phone-local enrollment must bind this public key to
 * the verified owner + device in JH Secure56 before any JH upload is enabled.
 */
class JhGlassDeviceSigner {
    private val random = SecureRandom()

    private fun keyStore(): KeyStore =
        KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    @Synchronized
    fun prepareFirstEnrollmentKey(): JhDeviceEnrollmentKey {
        val store = keyStore()
        if (!store.containsAlias(KEY_ALIAS)) {
            val generator = KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore"
            )
            val spec = KeyGenParameterSpec.Builder(
                KEY_ALIAS, KeyProperties.PURPOSE_SIGN
            )
                .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                // No biometric/OS popup on EACH user-initiated photo; the
                // trust grant comes from separately verified first enrollment.
                .setUserAuthenticationRequired(false)
                .build()
            generator.initialize(spec)
            generator.generateKeyPair()
        }
        val key = store.getCertificate(KEY_ALIAS)?.publicKey as? ECPublicKey
            ?: error("JH device signing key unavailable")
        val encoded = key.encoded
        return JhDeviceEnrollmentKey(
            publicKeyBase64Url = b64(encoded),
            publicKeyDigest = digestHex(encoded),
        )
    }

    fun hasEnrolledKeyOnThisPhone(): Boolean = keyStore().containsAlias(KEY_ALIAS)

    private fun signContent(message: String): String {
        val store = keyStore()
        val key = store.getKey(KEY_ALIAS, null) as? java.security.PrivateKey
            ?: error("Initial JH enrollment is required")
        val signer = Signature.getInstance("SHA256withECDSA")
        signer.initSign(key)
        signer.update(message.toByteArray(Charsets.UTF_8))
        return b64(signer.sign())  // DER ECDSA, compatible with Node verify()
    }

    fun signFirstEnrollment(
        ownerId: String,
        serverDigest: String,
        deviceDigest: String,
        expectedPublicKeyDigest: String,
        challenge: String,
    ): String {
        require(ownerId.matches(Regex(OWNER_RE)))
        require(serverDigest.matches(Regex(HEX_RE)))
        require(deviceDigest.matches(Regex(HEX_RE)))
        require(expectedPublicKeyDigest.matches(Regex(HEX_RE)))
        require(challenge.matches(Regex(ENROLL_RE)))
        val actual = prepareFirstEnrollmentKey()
        require(actual.publicKeyDigest == expectedPublicKeyDigest) {
            "JH enrollment server and AndroidKeyStore key do not match"
        }
        val text = listOf(
            "JH_GLASS_ENROLL_P256_V1", ownerId, serverDigest,
            deviceDigest, actual.publicKeyDigest, challenge
        ).joinToString("\n")
        return signContent(text)
    }

    /**
     * Invoke ONLY from an explicit user gesture or authenticated voice
     * command for one selected photo. Never use background stream callbacks.
     * photoSha256 MUST be the SHA-256 of the same JPEG bytes to be uploaded.
     */
    fun signUserRequestedPhoto(
        ownerId: String,
        serverDigest: String,
        deviceDigest: String,
        requestId: String,
        photoSha256: String,
        issuedAt: Long = System.currentTimeMillis(),
    ): JhDevicePhotoIntent {
        require(ownerId.matches(Regex(OWNER_RE)))
        require(serverDigest.matches(Regex(HEX_RE)))
        require(deviceDigest.matches(Regex(HEX_RE)))
        require(requestId.matches(Regex(CLAIM_RE)))
        require(photoSha256.matches(Regex(HEX_RE)))
        require(issuedAt > 0)
        val oneUseNonce = ByteArray(24).also(random::nextBytes).let(::b64)
        val msg = listOf(
            "JH_GLASS_PHOTO_INTENT_P256_V1", ownerId, serverDigest,
            deviceDigest, requestId, photoSha256, issuedAt.toString(), oneUseNonce
        ).joinToString("\n")
        return JhDevicePhotoIntent(
            requestId = requestId, deviceDigest = deviceDigest,
            photoSha256 = photoSha256, issuedAt = issuedAt,
            nonce = oneUseNonce, signature = signContent(msg)
        )
    }

    private fun b64(bytes: ByteArray): String =
        Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    private fun digestHex(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes)
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }
}
