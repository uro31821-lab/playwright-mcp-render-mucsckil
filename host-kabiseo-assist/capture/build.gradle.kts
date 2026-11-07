plugins { id("com.android.library") }
android {
    namespace = "com.jh.kabiseo.capture"
    compileSdk = 35
    defaultConfig { minSdk = 26 }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    lint { abortOnError = true }
}
// New external Google Maven binary dependencies are DECLARED ONLY.
// Do not release/build into the user's app before supply-chain & compatibility review.
val cameraX = "1.6.2"
dependencies {
    implementation("androidx.camera:camera-camera2:$cameraX")
    implementation("androidx.camera:camera-lifecycle:$cameraX")
    implementation("androidx.camera:camera-view:$cameraX")
    implementation("androidx.camera:camera-extensions:$cameraX")
    implementation("androidx.activity:activity:1.10.1")
}
