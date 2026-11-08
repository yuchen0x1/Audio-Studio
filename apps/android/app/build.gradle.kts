plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.audiostudio.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.audiostudio.app"
        minSdk = 29
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    buildFeatures {
        compose = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    // 注意：本机 SDK 只有 platform 35/36，且 compose 1.12+/lifecycle 2.11/core 1.19 要求
    // minCompileSdk=37，因此 BOM 与 androidx 版本固定在 compileSdk 35 兼容的组合。
    val composeBom = platform("androidx.compose:compose-bom:2026.06.01") // compose 1.11.4 (minCompileSdk=35)
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.16.0")                 // 1.17+ 需要 compileSdk 36
    implementation("androidx.activity:activity-compose:1.10.1")     // 1.13 需要 compileSdk 36
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0") // 2.11 需要 compileSdk 37
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("androidx.datastore:datastore-preferences:1.3.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")

    // 原 ffmpeg-kit 的活跃维护 fork（LGPL-3.0），API 与 com.arthenica.ffmpegkit 相同
    implementation("dev.ffmpegkit-maintained:ffmpeg-kit-audio:8.1.9")

    testImplementation("junit:junit:4.13.2")

    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test:rules:1.7.0")
}
