# The web app calls these methods by name through addJavascriptInterface.
-keepclassmembers class at.stoicranger.gunsafe.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
