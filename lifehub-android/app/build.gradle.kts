plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "com.koreanlifehub.bridge"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.koreanlifehub.bridge"
        minSdk = 30
        targetSdk = 35
        versionCode = 60
        versionName = "6.0"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
