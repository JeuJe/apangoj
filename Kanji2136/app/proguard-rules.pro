# JavaScript bridge methods are invoked from WebView.
-keepclassmembers class com.juhyeok.kanji2136.MainActivity$StoreBridge {
    @android.webkit.JavascriptInterface <methods>;
}
