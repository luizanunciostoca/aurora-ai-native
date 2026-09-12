plugins {
    id("com.android.application")
}

fun buildConfigString(value: String): String =
    "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

val auroraAndroidSha = providers.environmentVariable("AURORA_ANDROID_SHA").orElse("unbound").get()
val auroraHostSha = providers.environmentVariable("AURORA_HOST_SHA").orElse("unbound").get()
val auroraReleaseTupleId = providers.environmentVariable("AURORA_RELEASE_TUPLE_ID").orElse("unbound").get()

android {
    namespace = "ai.aurora.device"
    compileSdk = 36

    defaultConfig {
        applicationId = "ai.aurora.device"
        minSdk = 26
        targetSdk = 36
        versionCode = 3
        versionName = "0.16.0-physical.1"
        buildConfigField("String", "AURORA_ANDROID_SHA", buildConfigString(auroraAndroidSha))
        buildConfigField("String", "AURORA_HOST_SHA", buildConfigString(auroraHostSha))
        buildConfigField("String", "AURORA_RELEASE_TUPLE_ID", buildConfigString(auroraReleaseTupleId))
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
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.all {
            it.useJUnit()
        }
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
