plugins {
    id("com.android.application")
}

android {
    namespace = "com.fournik8.industrialcommand"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.fournik8.industrialcommand"
        minSdk = 26
        targetSdk = 35
        versionCode = 602
        versionName = "0.6.2"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.13.0")
}

// Reuse exactly the desktop client logic. No second copy of the calculations,
// markets, ship library, radio or theme can silently drift out of date.
val bundleSharedWeb by tasks.registering(Copy::class) {
    from(rootProject.projectDir.parentFile) {
        include("index.html")
        include("logic.js")
        include("app.js")
        include("styles.css")
        include("market_accuracy.js")
        include("market_explorer.js")
        include("resource_catalog.js")
        include("android_bridge.js")
        include("android.css")
    }
    into(layout.projectDirectory.dir("src/main/assets"))
}
tasks.named("preBuild") {
    dependsOn(bundleSharedWeb)
}
