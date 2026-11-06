plugins { id("com.android.library") }
android {
    namespace = "com.jh.pobiseo.assist.android"
    compileSdk = 35
    buildToolsVersion = "35.0.0"
    defaultConfig { minSdk = 34 }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { buildConfig = false }
    lint { abortOnError = true }
}
dependencies { api(project(":core")) }
