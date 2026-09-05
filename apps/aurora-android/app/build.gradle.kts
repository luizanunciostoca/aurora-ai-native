plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

val auroraBuildSha = providers.environmentVariable("AURORA_BUILD_SHA").orElse("prototype-local").get()

android {
    namespace = "ai.aurora.device"
    compileSdk = 36

    defaultConfig {
        applicationId = "ai.aurora.device"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "0.16.0-alpha.2"
        buildConfigField("String", "AURORA_BUILD_SHA", "\"$auroraBuildSha\"")
        buildConfigField("String", "AURORA_UI_PROFILE", "\"TABLET_UI_V2\"")
    }

    flavorDimensions += "environment"
    productFlavors {
        create("local") {
            dimension = "environment"
            applicationIdSuffix = ".local"
            versionNameSuffix = "-local"
            buildConfigField("String", "AURORA_ENVIRONMENT", "\"LOCAL\"")
            buildConfigField("String", "AURORA_GATEWAY_ORIGIN", "\"http://10.0.2.2:8080\"")
            buildConfigField("boolean", "AURORA_ALLOW_CLEARTEXT", "true")
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
        create("staging") {
            dimension = "environment"
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            buildConfigField("String", "AURORA_ENVIRONMENT", "\"STAGING\"")
            buildConfigField("String", "AURORA_GATEWAY_ORIGIN", "\"https://staging.invalid\"")
            buildConfigField("boolean", "AURORA_ALLOW_CLEARTEXT", "false")
            manifestPlaceholders["usesCleartextTraffic"] = "false"
        }
        create("production") {
            dimension = "environment"
            buildConfigField("String", "AURORA_ENVIRONMENT", "\"PRODUCTION\"")
            buildConfigField("String", "AURORA_GATEWAY_ORIGIN", "\"https://production.invalid\"")
            buildConfigField("boolean", "AURORA_ALLOW_CLEARTEXT", "false")
            manifestPlaceholders["usesCleartextTraffic"] = "false"
        }
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.all { it.useJUnit() }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2026.04.01")
    implementation(composeBom)
    testImplementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.activity:activity-compose:1.12.4")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.runtime:runtime")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.9.4")

    debugImplementation("androidx.compose.ui:ui-tooling")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    testImplementation("junit:junit:4.13.2")
}
