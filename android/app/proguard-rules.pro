# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Keep Capacitor classes (WebView JS bridge)
-keep class com.getcapacitor.** { *; }
-keep class fund.eranos.app.** { *; }

# Keep WebView JS interfaces
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep OkHttp (used by Capacitor)
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }

# Barcode scanner plugin (@capacitor/barcode-scanner -> OutSystems ionbarcode)
# references Gson's @SerializedName, but Gson isn't on the release classpath.
# Suppress the missing-class warning, keep the annotation attribute, and keep
# the plugin's model classes so R8 doesn't strip/rename serialized fields.
-dontwarn com.google.gson.**
-keepattributes *Annotation*
-keep class com.outsystems.plugins.barcode.** { *; }

# Keep arti (Tor) classes — ArtiJNI declares native methods invoked from the
# Rust .so via JNI, so its names must not be obfuscated/stripped.
-keep class org.torproject.arti.** { *; }

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
