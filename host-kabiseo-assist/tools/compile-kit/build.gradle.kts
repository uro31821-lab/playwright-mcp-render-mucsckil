// Dependency-only bootstrap. Contains NO JH application source, credentials or install task.
plugins {
    id("com.android.application") version "8.7.3"
    id("org.jetbrains.kotlin.android") version "1.9.24"
}
android {
    namespace="com.koreanlifehub.bridge"
    compileSdk=35
    defaultConfig { applicationId="com.koreanlifehub.bridge"; minSdk=26; targetSdk=35 }
    compileOptions { sourceCompatibility=JavaVersion.VERSION_17; targetCompatibility=JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget="17" }
}
val compilerTool by configurations.creating { isCanBeConsumed=false; isCanBeResolved=true }
val testTool by configurations.creating { isCanBeConsumed=false; isCanBeResolved=true }
dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okio:okio-jvm:3.6.0")
    implementation("androidx.credentials:credentials:1.5.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.5.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
    implementation("com.google.mlkit:text-recognition-korean:16.0.1")
    testTool("junit:junit:4.13.2")
    compilerTool("org.jetbrains.kotlin:kotlin-compiler-embeddable:1.9.24")
}
tasks.register("exportCompileDependencies") {
    doLast {
        val destination=layout.buildDirectory.dir("compile-kit-input").get().asFile
        destination.mkdirs()
        val rows=mutableListOf<String>()
        // Test classpath also contains the app project itself; resolve only external compile inputs.
        listOf("releaseCompileClasspath","testTool","compilerTool").forEach { name ->
            val target=destination.resolve(if(name=="compilerTool") "compiler" else "dependencies")
            target.mkdirs()
            configurations.getByName(name).resolvedConfiguration.resolvedArtifacts.forEach { a ->
                val filename=(a.moduleVersion.id.toString()+"-"+a.file.name).replace(Regex("[^A-Za-z0-9._-]"),"_")
                a.file.copyTo(target.resolve(filename),overwrite=true)
                rows.add(name+"\t"+a.moduleVersion.id+"\t"+filename)
            }
        }
        destination.resolve("resolved-dependencies.tsv").writeText(rows.sorted().joinToString("\n")+"\n")
    }
}
