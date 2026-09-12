plugins {
    id("com.android.application")
}

fun buildConfigString(value: String): String =
    "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

val auroraAndroidSha = providers.environmentVariable("AURORA_ANDROID_SHA").orElse("unbound").get()
val auroraHostSha = providers.environmentVariable("AURORA_HOST_SHA").orElse("unbound").get()
val auroraReleaseTupleId = providers.environmentVariable("AURORA_RELEASE_TUPLE_ID").orElse("unbound").get()
val auroraLocalGatewayOrigin =
    providers.environmentVariable("AURORA_LOCAL_GATEWAY_ORIGIN").orElse("http://10.0.2.2:8080").get()

val physicalDevSigningValues =
    mapOf(
        "storeFile" to providers.environmentVariable("AURORA_PHYSICAL_DEV_KEYSTORE").orNull,
        "storePassword" to providers.environmentVariable("AURORA_PHYSICAL_DEV_STORE_PASSWORD").orNull,
        "keyAlias" to providers.environmentVariable("AURORA_PHYSICAL_DEV_KEY_ALIAS").orNull,
        "keyPassword" to providers.environmentVariable("AURORA_PHYSICAL_DEV_KEY_PASSWORD").orNull,
    )
val configuredPhysicalDevSigningValues =
    physicalDevSigningValues.filterValues { !it.isNullOrBlank() }
require(
    configuredPhysicalDevSigningValues.isEmpty() ||
        configuredPhysicalDevSigningValues.size == physicalDevSigningValues.size,
) {
    "physical development signing must be either fully configured or completely absent"
}
val physicalDevSigningConfigured =
    configuredPhysicalDevSigningValues.size == physicalDevSigningValues.size

android {
    namespace = "ai.aurora.device"
    compileSdk = 36

    defaultConfig {
        applicationId = "ai.aurora.device"
        minSdk = 26
        targetSdk = 36
        versionCode = 4
        versionName = "0.17.0-dev.1"
        buildConfigField("String", "AURORA_ANDROID_SHA", buildConfigString(auroraAndroidSha))
        buildConfigField("String", "AURORA_HOST_SHA", buildConfigString(auroraHostSha))
        buildConfigField("String", "AURORA_RELEASE_TUPLE_ID", buildConfigString(auroraReleaseTupleId))
        buildConfigField("String", "AURORA_SIGNING_PROFILE", "\"NON_PHYSICAL\"")
    }

    if (physicalDevSigningConfigured) {
        signingConfigs {
            create("physicalDev") {
                storeFile = file(checkNotNull(physicalDevSigningValues.getValue("storeFile")))
                storePassword = checkNotNull(physicalDevSigningValues.getValue("storePassword"))
                keyAlias = checkNotNull(physicalDevSigningValues.getValue("keyAlias"))
                keyPassword = checkNotNull(physicalDevSigningValues.getValue("keyPassword"))
                enableV1Signing = true
                enableV2Signing = true
                enableV3Signing = true
                enableV4Signing = true
            }
        }
    }

    buildTypes {
        getByName("debug") {
            buildConfigField("String", "AURORA_SIGNING_PROFILE", "\"DEBUG_FALLBACK\"")
        }
        if (physicalDevSigningConfigured) {
            create("physicalDev") {
                initWith(getByName("debug"))
                signingConfig = signingConfigs.getByName("physicalDev")
                matchingFallbacks += listOf("debug")
                buildConfigField("String", "AURORA_SIGNING_PROFILE", "\"PHYSICAL_DEV_STABLE\"")
            }
        }
    }

    flavorDimensions += "environment"
    productFlavors {
        create("local") {
            dimension = "environment"
            applicationIdSuffix = ".local"
            versionNameSuffix = "-local"
            buildConfigField("String", "AURORA_ENVIRONMENT", "\"LOCAL\"")
            // Emulator/local-debug builds retain 10.0.2.2 by default. Physical same-tablet
            // packaging injects AURORA_LOCAL_GATEWAY_ORIGIN=http://127.0.0.1:8080 and builds the
            // dedicated localPhysicalDev variant only when stable signing material is present.
            buildConfigField("String", "AURORA_GATEWAY_ORIGIN", buildConfigString(auroraLocalGatewayOrigin))
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

    // Stable physical-development signing is intentionally exposed only as localPhysicalDev.
    // STAGING/PRODUCTION must never inherit that key or report the stable physical profile.
    variantFilter {
        if (buildType.name == "physicalDev" && flavors.none { it.name == "local" }) {
            setIgnore(true)
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
