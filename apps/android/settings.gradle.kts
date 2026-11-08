pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // ffmpeg-kit-maintained README 要求的兜底仓库
        maven { url = uri("https://jcenter.bintray.com/") }
    }
}

rootProject.name = "AudioStudio"
include(":app")
